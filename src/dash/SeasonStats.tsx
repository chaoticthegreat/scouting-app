// src/dash/SeasonStats.tsx
// Broadcast "Season Rankings" card surfacing OUR team's season-long standing:
// World Rank, Total EPA, and Season Record. This is where the in-house EPA is
// finally made VISIBLE. The in-house EPA (see src/dash/localEpa.ts) is derived
// purely from played match results (actual_red_score/actual_blue_score on the
// `match` table, which originate from The Blue Alliance via event import); it is
// a faithful, Statbotics-style estimate used only when the live Statbotics EPA
// is unavailable, and is labelled "in-house" so it is never mistaken for the
// official number.
//
// Pure & presentational: props in → JSX out. No fetching, no side effects. The
// orchestrator resolves which EPA to show (Statbotics or in-house) and passes
// `epaSource` so this card can label it correctly.

import { Trophy, Globe, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/StatTile';
import { cn } from '@/lib/utils';
import { computeLocalEpa } from '@/dash/localEpa';
import type { MatchRow } from '@/dash/useEventData';

/* ------------------------------------------------------------------ helpers */

/**
 * The in-house (TBA-derived) EPA for a single team, computed from the event's
 * played match results. Returns null when the team has no computed EPA (e.g.
 * no played matches, or the team never appeared on an alliance). Never throws.
 */
export function inHouseEpaForTeam(matches: MatchRow[], team: number): number | null {
  return computeLocalEpa(matches).get(team) ?? null;
}

/** A defensively-parsed slice of a Statbotics v3 `/team_year` response. */
export interface StatboticsSeason {
  worldRank: number | null;
  totalEpa: number | null;
  record: string | null;
}

function finiteOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Defensively read a Statbotics v3 `/team_year/{team}/{year}` object into a
 * {@link StatboticsSeason}. Tolerant of missing/garbage shapes — any unexpected
 * input yields all-null and never throws.
 *   - worldRank ← epa.ranks.total.rank
 *   - totalEpa  ← epa.total_points.mean, else epa.breakdown.total_points
 *   - record    ← record {wins,losses,ties} → "W-L-T"
 */
export function parseStatboticsTeamYear(json: unknown): StatboticsSeason {
  const empty: StatboticsSeason = { worldRank: null, totalEpa: null, record: null };
  if (!isObject(json)) return empty;

  const epa = isObject(json.epa) ? json.epa : null;

  let worldRank: number | null = null;
  if (epa && isObject(epa.ranks) && isObject(epa.ranks.total)) {
    worldRank = finiteOrNull(epa.ranks.total.rank);
  }

  let totalEpa: number | null = null;
  if (epa) {
    if (isObject(epa.total_points)) {
      totalEpa = finiteOrNull(epa.total_points.mean);
    }
    if (totalEpa == null && isObject(epa.breakdown)) {
      totalEpa = finiteOrNull(epa.breakdown.total_points);
    }
  }

  let record: string | null = null;
  if (isObject(json.record)) {
    const w = finiteOrNull(json.record.wins);
    const l = finiteOrNull(json.record.losses);
    const t = finiteOrNull(json.record.ties);
    if (w != null && l != null && t != null) record = `${w}-${l}-${t}`;
  }

  return { worldRank, totalEpa, record };
}

/* --------------------------------------------------------------- component */

export type EpaSource = 'statbotics' | 'inhouse' | 'none';

export interface SeasonStatsProps {
  team: number;
  /** Statbotics world rank, or null if unavailable. */
  worldRank: number | null;
  /** The resolved EPA value to display. */
  totalEpa: number | null;
  /** Where {@link totalEpa} came from (drives the labelling). */
  epaSource: EpaSource;
  /** Season record "W-L-T", or null. */
  seasonRecord: string | null;
  className?: string;
}

/** Chip flagging that the Total EPA was computed in-house from TBA results. */
function InHouseBadge() {
  return (
    <span
      data-testid="dash-season-epa-source"
      title="Computed in-house from TheBlueAlliance match results — Statbotics EPA unavailable"
      className="inline-flex items-center rounded-full border border-energy/40 bg-energy/15 px-2 py-0.5 text-[11px] font-medium text-energy"
    >
      in-house
    </span>
  );
}

/** Subtle label crediting Statbotics as the EPA source. */
function StatboticsLabel() {
  return (
    <span className="text-[11px] font-medium text-muted-foreground">Statbotics</span>
  );
}

/**
 * "Season Rankings" card for the broadcast dashboard. Shows OUR team's World
 * Rank, Total EPA (Statbotics when available, otherwise the in-house TBA-derived
 * estimate — clearly labelled), and Season Record. Crashes on nothing.
 */
export default function SeasonStats({
  team,
  worldRank,
  totalEpa,
  epaSource,
  seasonRecord,
  className,
}: SeasonStatsProps): JSX.Element {
  const showInHouse = epaSource === 'inhouse' && totalEpa != null;
  const showStatbotics = epaSource === 'statbotics' && totalEpa != null;

  return (
    <Card data-testid="dash-season-rank" className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <Trophy className="size-4 text-muted-foreground" /> Season Rankings
        </CardTitle>
        <span className="font-mono text-xs text-muted-foreground">{team}</span>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 sm:grid-cols-3">
        <StatTile
          label="Season Record"
          tone="brand"
          icon={<Trophy />}
          value={<span data-testid="dash-season-record">{seasonRecord ?? '—'}</span>}
        />
        <StatTile
          label="World Rank"
          tone="energy"
          icon={<Globe />}
          value={
            <span data-testid="dash-season-world-rank">
              {worldRank != null ? `#${worldRank}` : '—'}
            </span>
          }
        />
        <StatTile
          label="Total EPA"
          tone="brand"
          icon={<Gauge />}
          value={
            <span data-testid="dash-season-epa">
              {totalEpa != null ? totalEpa.toFixed(1) : '—'}
            </span>
          }
          sub={
            showInHouse ? (
              <InHouseBadge />
            ) : showStatbotics ? (
              <StatboticsLabel />
            ) : null
          }
        />
      </CardContent>
    </Card>
  );
}
