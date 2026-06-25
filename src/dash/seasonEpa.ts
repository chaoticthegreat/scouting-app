// src/dash/seasonEpa.ts
//
// Season-wide (cross-event) EPA support for the LOCAL (TBA-derived) fallback.
//
// The EPA model in localEpa.ts (computeLocalEpa) carries EPA forward naturally
// because it processes matches chronologically. So if we feed it the COMBINED
// set of every match a team has played this season (across every event they've
// attended), a team arriving at event #3 starts with the EPA it built up at
// events #1 and #2 — exactly the desired season carry-over.
//
// CRITICAL: we must feed computeLocalEpa COMPLETE match sets (all 6 teams per
// match), never a single team's slice — see the long comment in
// useTeamSeasonStats. So we union the EVENTS the requested teams attended, fetch
// each event's full match list, concatenate, dedupe by match key, and run the
// model once over the combined set. computeLocalEpa/tbaMatchesToRows already
// sort the combined set chronologically across events by time.
//
// Caching: the per-event matches fetch and the per-team events fetch are routed
// through dedicated React Query cache entries (queryClient.fetchQuery) so they
// are shared/deduped across hooks and persisted to IndexedDB (see queryPersist).
// Repeat loads (and a second hook needing the same event) reuse the cache rather
// than re-hitting TBA.

import { tbaGet } from '@/dash/proxies';
import { tbaMatchesToRows } from '@/dash/localEpa';
import { queryClient } from '@/lib/queryPersist';
import type { MatchRow } from '@/dash/useEventData';

// EPA / cross-event data changes slowly (only when new matches finish), and the
// season fan-out multiplies TBA calls, so it gets a longer stale window than the
// 60s live/schedule queries. Used by useEventEpa, useTeamSeasonStats, and the
// TBA sub-queries below.
export const EPA_STALE_TIME = 5 * 60_000;

/**
 * Raw TBA match array for one event, behind a shared React Query cache entry so
 * multiple hooks (and the season fan-out across teams) dedupe on it and it
 * persists to IndexedDB. Returns [] on any TBA outage — never throws.
 */
export async function fetchEventMatchesCached(eventKey: string): Promise<unknown[]> {
  try {
    const json = await queryClient.fetchQuery({
      queryKey: ['tba', 'event-matches', eventKey],
      staleTime: EPA_STALE_TIME,
      retry: false,
      queryFn: async (): Promise<unknown[]> => {
        const data = await tbaGet<unknown>(`/event/${eventKey}/matches`);
        return Array.isArray(data) ? data : [];
      },
    });
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

/**
 * The event keys a team attended in `year`, behind a shared React Query cache
 * entry. Returns [] on any TBA outage — never throws.
 */
export async function fetchTeamEventKeysCached(
  team: number,
  year: string,
): Promise<string[]> {
  try {
    return await queryClient.fetchQuery({
      queryKey: ['tba', 'team-events', team, year],
      staleTime: EPA_STALE_TIME,
      retry: false,
      queryFn: async (): Promise<string[]> => {
        const data = await tbaGet<unknown>(`/team/frc${team}/events/${year}`);
        if (!Array.isArray(data)) return [];
        const keys: string[] = [];
        for (const e of data) {
          if (typeof e === 'string') keys.push(e);
          else if (e && typeof e === 'object') {
            const k = (e as { key?: unknown }).key;
            if (typeof k === 'string') keys.push(k);
          }
        }
        return keys;
      },
    });
  } catch {
    return [];
  }
}

/**
 * The chronological, deduped, season-wide MatchRow[] across every event the
 * requested teams attended this season (always including `eventKey`). Feed this
 * to computeLocalEpa to get per-team EPA that reflects all prior events.
 *
 * Defensive: any TBA outage degrades to whatever it could fetch (down to []),
 * never throws. `year` is derived from the event key by the caller.
 */
export async function fetchSeasonMatchRows(
  teamNumbers: number[],
  eventKey: string,
  year: string,
): Promise<MatchRow[]> {
  // Union of events the requested teams attended, always including the current.
  const eventKeys = new Set<string>([eventKey]);
  const teamEventLists = await Promise.all(
    teamNumbers.map((t) => fetchTeamEventKeysCached(t, year)),
  );
  for (const list of teamEventLists) {
    for (const ek of list) eventKeys.add(ek);
  }

  // Fetch each event's full match list (cached) and concatenate, deduping by
  // match key so a match never double-counts if it appeared in two payloads.
  const perEvent = await Promise.all(
    [...eventKeys].map((ek) => fetchEventMatchesCached(ek)),
  );
  const seen = new Set<string>();
  const combined: unknown[] = [];
  for (const arr of perEvent) {
    for (const m of arr) {
      const key =
        m && typeof m === 'object' && typeof (m as { key?: unknown }).key === 'string'
          ? ((m as { key: string }).key)
          : null;
      if (key != null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      combined.push(m);
    }
  }

  // tbaMatchesToRows sorts the combined set chronologically across events and
  // assigns a fresh monotonic match_number so the model plays them in true order.
  return tbaMatchesToRows(combined);
}
