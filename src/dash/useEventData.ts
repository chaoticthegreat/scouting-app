import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { tbaGet, statboticsGet, nexusGet, epaFromTeamEvent } from '@/dash/proxies';
import { computeLocalEpa } from '@/dash/localEpa';
import {
  parseNexusEventStatus,
  type NexusEventStatus,
} from '@/dash/nexusClient';
import {
  parseStatboticsTeamYear,
  inHouseEpaForTeam,
  type EpaSource,
} from '@/dash/SeasonStats';
import type { EventWebcast } from '@/dash/EventStream';
import type { MsrRow } from '@/dash/types';

const STALE_TIME = 60_000;

export interface TeamRow {
  team_number: number;
  nickname: string | null;
}

export interface MatchRow {
  match_key: string;
  event_key: string;
  comp_level: string;
  match_number: number;
  scheduled_time: string | null;
  red1: number | null;
  red2: number | null;
  red3: number | null;
  blue1: number | null;
  blue2: number | null;
  blue3: number | null;
  actual_red_score: number | null;
  actual_blue_score: number | null;
  winner: string | null;
  result_synced_at: string | null;
}

export interface ScoutRow {
  id: string;
  display_name: string | null;
  event_key: string;
}

export interface EventEpa {
  epaByTeam: Map<number, number | null>;
  available: boolean;
  /**
   * Where the EPA values came from:
   *  - 'statbotics': live Statbotics EPA for at least one team.
   *  - 'local': Statbotics was down for ALL teams, so we computed a simplified
   *    local EPA from this event's played match results (see computeLocalEpa).
   *  - 'none': neither source produced anything (e.g. no matches passed in).
   * Additive + OPTIONAL so existing object-literal fixtures (e.g. RankingView /
   * TeamView tests owned by another agent) keep type-checking. `useEventEpa`
   * ALWAYS sets it, so hook consumers can rely on a concrete value.
   */
  source?: 'statbotics' | 'local' | 'none';
}

/** Parsed Nexus live status plus an availability flag for graceful degradation. */
export interface NexusStatusResult {
  status: NexusEventStatus | null;
  available: boolean;
}

/** Scouting reports for an event (deleted rows excluded; RLS-scoped). */
export function useEventReports(eventKey: string | null): UseQueryResult<MsrRow[]> {
  return useQuery({
    queryKey: ['reports', eventKey],
    enabled: !!eventKey,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<MsrRow[]> => {
      const { data, error } = await supabase
        .from('match_scouting_report')
        .select('*')
        .eq('event_key', eventKey as string)
        .eq('deleted', false);
      if (error) {
        throw error;
      }
      return (data ?? []) as MsrRow[];
    },
  });
}

/** Match schedule (and live results, when synced) for an event. */
export function useEventMatches(eventKey: string | null): UseQueryResult<MatchRow[]> {
  return useQuery({
    queryKey: ['matches', eventKey],
    enabled: !!eventKey,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<MatchRow[]> => {
      const { data, error } = await supabase
        .from('match')
        .select('*')
        .eq('event_key', eventKey as string)
        .order('match_number', { ascending: true });
      if (error) {
        throw error;
      }
      return (data ?? []) as MatchRow[];
    },
  });
}

/** Teams participating in an event (via event_team → team). */
export function useEventTeams(eventKey: string | null): UseQueryResult<TeamRow[]> {
  return useQuery({
    queryKey: ['teams', eventKey],
    enabled: !!eventKey,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await supabase
        .from('event_team')
        .select('team:team(team_number,nickname)')
        .eq('event_key', eventKey as string);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as unknown as Array<{ team: TeamRow | null }>;
      return rows
        .map((r) => r.team)
        .filter((t): t is TeamRow => t !== null);
    },
  });
}

/** Scouters registered for an event (read from the open `scout` table, 0009 RLS). */
export function useEventScouts(eventKey: string | null): UseQueryResult<ScoutRow[]> {
  return useQuery({
    queryKey: ['scouts', eventKey],
    enabled: !!eventKey,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<ScoutRow[]> => {
      const { data, error } = await supabase
        .from('scout')
        .select('id,display_name,event_key')
        .eq('event_key', eventKey as string);
      if (error) {
        throw error;
      }
      return (data ?? []) as ScoutRow[];
    },
  });
}

/** TBA event rankings (through the tba-proxy). */
export function useTbaRankings<T = unknown>(eventKey: string | null): UseQueryResult<T> {
  return useQuery({
    queryKey: ['tba', 'rankings', eventKey],
    enabled: !!eventKey,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<T> => tbaGet<T>(`/event/${eventKey}/rankings`),
  });
}

/**
 * Statbotics EPA for a set of teams at an event, with a local fallback.
 *
 * Degrades gracefully: a team whose Statbotics proxy call returns the
 * unavailable sentinel (or has no parseable EPA) maps to null. When Statbotics
 * is down for EVERY team, we compute a simplified local EPA from `matches`
 * (this event's played results) and populate the requested teams instead.
 *
 * `source` reports which path produced the values: 'statbotics' | 'local' |
 * 'none'. `available` is true when either source yields data.
 *
 * NOTE FOR INTEGRATORS: `matches` is OPTIONAL (default []) so existing 2-arg
 * callers (e.g. RankingView.tsx, TeamView.tsx — owned by another agent) keep
 * type-checking. When `matches` is empty the local fallback simply can't
 * compute, so `source` stays 'none' (identical to the pre-fallback behavior).
 * To enable the local fallback in those views, pass the event's MatchRow[] as
 * the third argument.
 */
export function useEventEpa(
  teamNumbers: number[],
  eventKey: string | null,
  matches: MatchRow[] = [],
): UseQueryResult<EventEpa> {
  const sortedTeams = [...teamNumbers].sort((a, b) => a - b);
  // A cheap, stable signature of the played matches so the query refetches when
  // results change but not on every render.
  const matchesSig = matches
    .filter((m) => m.actual_red_score != null && m.actual_blue_score != null)
    .map((m) => `${m.match_key}:${m.actual_red_score}-${m.actual_blue_score}`)
    .join(',');
  return useQuery({
    queryKey: ['epa', eventKey, sortedTeams.join(','), matchesSig],
    enabled: !!eventKey && sortedTeams.length > 0,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<EventEpa> => {
      const epaByTeam = new Map<number, number | null>();
      let anyAvailable = false;

      const results = await Promise.all(
        sortedTeams.map(async (team) => {
          const json = await statboticsGet<unknown>(`/team_event/${team}/${eventKey}`);
          const unavailable =
            typeof json === 'object' &&
            json !== null &&
            (json as { available?: unknown }).available === false;
          return { team, json, unavailable };
        }),
      );

      for (const { team, json, unavailable } of results) {
        if (unavailable) {
          epaByTeam.set(team, null);
          continue;
        }
        const value = epaFromTeamEvent(json);
        epaByTeam.set(team, value);
        // Count Statbotics as "available" ONLY when it yields a REAL number. A 200
        // response with no usable EPA (e.g. an off-season / not-yet-played event)
        // must fall through to the local (TBA-derived) estimate below — otherwise
        // every team shows "—" even though we could compute EPA from results.
        if (value != null) anyAvailable = true;
      }

      if (anyAvailable) {
        return { epaByTeam, available: true, source: 'statbotics' };
      }

      // Statbotics down for every team -> try the local fallback from results.
      const localEpa = computeLocalEpa(matches);
      if (localEpa.size > 0) {
        let anyLocal = false;
        for (const team of sortedTeams) {
          const v = localEpa.get(team);
          if (v !== undefined) {
            epaByTeam.set(team, v);
            anyLocal = true;
          } else {
            epaByTeam.set(team, null);
          }
        }
        if (anyLocal) {
          return { epaByTeam, available: true, source: 'local' };
        }
      }

      return { epaByTeam, available: false, source: 'none' };
    },
  });
}

/**
 * Live field status for an event from FRC Nexus (through nexus-proxy). Short
 * staleTime for liveness. Returns a parsed status + an `available` flag that is
 * false when Nexus is unavailable/unset, so callers can degrade to the schedule.
 */
export function useNexusEventStatus(
  eventKey: string | null,
): UseQueryResult<NexusStatusResult> {
  return useQuery({
    queryKey: ['nexus', 'event', eventKey],
    enabled: !!eventKey,
    staleTime: 15_000,
    queryFn: async (): Promise<NexusStatusResult> => {
      const json = await nexusGet<unknown>(`/event/${eventKey}`);
      const unavailable =
        typeof json === 'object' &&
        json !== null &&
        (json as { available?: unknown }).available === false;
      if (unavailable) {
        return { status: null, available: false };
      }
      return { status: parseNexusEventStatus(json), available: true };
    },
  });
}

/** Parsed TBA event header info: display name + first usable webcast. */
export interface EventInfo {
  name: string | null;
  webcast: EventWebcast | null;
}

/** Pull the first webcast (youtube/twitch first) off a TBA event object. */
function firstWebcast(data: unknown): EventWebcast | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = (data as { webcasts?: unknown }).webcasts;
  if (!Array.isArray(raw)) return null;
  const parsed: EventWebcast[] = [];
  for (const w of raw) {
    if (typeof w !== 'object' || w === null) continue;
    const type = (w as { type?: unknown }).type;
    if (typeof type !== 'string' || !type) continue;
    const channel = (w as { channel?: unknown }).channel;
    const file = (w as { file?: unknown }).file;
    parsed.push({
      type,
      channel: typeof channel === 'string' ? channel : null,
      file: typeof file === 'string' ? file : null,
    });
  }
  if (parsed.length === 0) return null;
  // Prefer an embeddable youtube/twitch stream over other types.
  return (
    parsed.find((w) => w.type === 'youtube' || w.type === 'twitch') ?? parsed[0]
  );
}

/**
 * TBA event header (name + livestream webcast) for the broadcast dashboard.
 * Degrades to `{ name: null, webcast: null }` if TBA is unreachable.
 */
export function useEventInfo(eventKey: string | null): UseQueryResult<EventInfo> {
  return useQuery({
    queryKey: ['tba', 'event-info', eventKey],
    enabled: !!eventKey,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<EventInfo> => {
      try {
        const data = await tbaGet<{ name?: string }>(`/event/${eventKey}`);
        const name = typeof data?.name === 'string' ? data.name : null;
        return { name, webcast: firstWebcast(data) };
      } catch {
        return { name: null, webcast: null };
      }
    },
  });
}

/** Season-level stats for OUR team: Statbotics world rank/EPA with in-house fallback. */
export interface TeamSeasonStats {
  worldRank: number | null;
  totalEpa: number | null;
  epaSource: EpaSource;
  seasonRecord: string | null;
}

/**
 * Season EPA + world rank for a single team from Statbotics
 * (`/team_year/{team}/{year}`, year derived from the event key). When Statbotics
 * is down OR has no EPA for the team, falls back to the in-house EPA computed
 * from this event's played match results (TBA-derived) and flags the source as
 * 'inhouse' so the UI can label it. `source` is 'none' when neither yields a value.
 */
export function useTeamSeasonStats(
  team: number,
  eventKey: string | null,
  matches: MatchRow[] = [],
): UseQueryResult<TeamSeasonStats> {
  const year = eventKey ? eventKey.slice(0, 4) : '';
  const matchesSig = matches
    .filter((m) => m.actual_red_score != null && m.actual_blue_score != null)
    .map((m) => `${m.match_key}:${m.actual_red_score}-${m.actual_blue_score}`)
    .join(',');
  return useQuery({
    queryKey: ['statbotics', 'team-year', team, year, matchesSig],
    enabled: !!eventKey && team > 0,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<TeamSeasonStats> => {
      const json = await statboticsGet<unknown>(`/team_year/${team}/${year}`);
      const unavailable =
        typeof json === 'object' &&
        json !== null &&
        (json as { available?: unknown }).available === false;
      const sb = unavailable
        ? { worldRank: null, totalEpa: null, record: null }
        : parseStatboticsTeamYear(json);

      if (sb.totalEpa != null) {
        return {
          worldRank: sb.worldRank,
          totalEpa: sb.totalEpa,
          epaSource: 'statbotics',
          seasonRecord: sb.record,
        };
      }

      // Statbotics EPA missing -> surface the in-house (TBA-derived) estimate.
      const local = inHouseEpaForTeam(matches, team);
      if (local != null) {
        return {
          worldRank: sb.worldRank,
          totalEpa: local,
          epaSource: 'inhouse',
          seasonRecord: sb.record,
        };
      }

      return {
        worldRank: sb.worldRank,
        totalEpa: null,
        epaSource: 'none',
        seasonRecord: sb.record,
      };
    },
  });
}
