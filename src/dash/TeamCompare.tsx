// src/dash/TeamCompare.tsx
// Multi-team visual comparison for the Ranking tab. Given 2–6 selected teams
// (each a resolved Ranking row: TeamAgg + best-available EPA), it draws a
// dependency-free SVG RADAR overlay across the key scouting/EPA metrics, with a
// per-team legend. Each axis is normalized 0..1 — rate metrics (climb %,
// reliability) use their natural 0..1 scale; magnitude metrics (Exp. pts, EPA,
// defense rating, fuel, auto) are normalized against the max among the selected
// teams so the largest team pins that axis and the rest read as a fraction of it.
//
// REUSES the chart design tokens (CHART_COLORS / SERIES_PALETTE) and the shared
// EmptyChart from src/dash/charts/* — no new charting dependency, no refetch:
// it consumes the team aggregates RankingView already loaded.

import { CHART_COLORS, SERIES_PALETTE, EmptyChart } from '@/dash/charts';
import type { TeamAgg } from '@/dash/aggregate';

/** A resolved Ranking row reduced to what the comparison needs. */
export interface CompareTeam {
  agg: TeamAgg;
  /** Best-available EPA (Statbotics → local → in-house), or null. */
  epa: number | null;
}

/** A radar axis: a labelled metric pulled from a CompareTeam. */
export interface CompareAxis {
  key: string;
  label: string;
  /** Raw value for a team, or null when the team has no value for this axis. */
  get: (t: CompareTeam) => number | null;
  /**
   * Normalization mode. `rate` values are already 0..1 (climb %, reliability);
   * `magnitude` values are normalized against the max among the compared teams.
   */
  scale: 'rate' | 'magnitude';
}

/** The radar axes, in clockwise order. Mirrors the key scouting+EPA metrics. */
export const COMPARE_AXES: CompareAxis[] = [
  {
    key: 'expPts',
    label: 'Exp. Pts',
    get: (t) => t.agg.scoutingExpectedPoints,
    scale: 'magnitude',
  },
  { key: 'epa', label: 'EPA', get: (t) => t.epa, scale: 'magnitude' },
  { key: 'climb', label: 'Climb %', get: (t) => t.agg.climbSuccessRate, scale: 'rate' },
  { key: 'reliability', label: 'Reliability', get: (t) => t.agg.reliability, scale: 'rate' },
  { key: 'defense', label: 'Defense', get: (t) => t.agg.avgDefenseRating, scale: 'magnitude' },
  { key: 'fuel', label: 'Fuel', get: (t) => t.agg.meanFuelPoints, scale: 'magnitude' },
  { key: 'auto', label: 'Auto', get: (t) => t.agg.meanAutoFuel, scale: 'magnitude' },
];

/** Max teams supported by the radar palette / legibility. */
export const MAX_COMPARE_TEAMS = 6;

/** A team's normalized values (0..1) per axis, plus identity + display palette. */
export interface CompareSeries {
  teamNumber: number;
  /** Index into SERIES_PALETTE-derived radar palette (see RADAR_PALETTE). */
  colorIndex: number;
  /** One normalized value in [0,1] per axis (same order as `axes`). */
  values: number[];
}

/** Defense rating is on a fixed 1..5 scale; normalize it against that ceiling so
 *  two teams with similar high ratings don't both pin the axis spuriously. */
const DEFENSE_MAX = 5;

/**
 * Pure: normalize the selected teams' raw axis values into 0..1 radar series.
 *
 * - `rate` axes pass through clamped to [0,1].
 * - `magnitude` axes divide by the max value observed across the teams for that
 *   axis (so the strongest team reaches the rim and the rest are relative). The
 *   defense axis uses a fixed 1..5 ceiling instead, since it's a bounded rating.
 * - A null/absent value contributes 0 on its axis (no spoke), and never NaN.
 *
 * Kept separate from the component so it's unit-testable.
 */
export function buildCompareSeries(
  teams: CompareTeam[],
  axes: CompareAxis[] = COMPARE_AXES,
): CompareSeries[] {
  // Per-axis max across teams for magnitude normalization (skip non-finite).
  const axisMax = axes.map((axis) => {
    if (axis.scale !== 'magnitude') return 1;
    if (axis.key === 'defense') return DEFENSE_MAX;
    let max = 0;
    for (const t of teams) {
      const v = axis.get(t);
      if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
    }
    return max;
  });

  return teams.map((t, ti) => ({
    teamNumber: t.agg.teamNumber,
    colorIndex: ti,
    values: axes.map((axis, ai) => {
      const raw = axis.get(t);
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
      if (axis.scale === 'rate') return Math.min(1, raw);
      const max = axisMax[ai];
      return max > 0 ? Math.min(1, raw / max) : 0;
    }),
  }));
}

// --- radar geometry ----------------------------------------------------------
const VB = 240; // square viewBox
const CENTER = VB / 2;
const RADIUS = 92; // outer ring radius
const RINGS = 4; // concentric grid rings

/** Six-team palette built from the shared chart tokens (+ two extras to reach 6). */
const RADAR_PALETTE: string[] = [
  ...SERIES_PALETTE.map((k) => CHART_COLORS[k]), // brand, energy, success, warning
  'hsl(var(--brand))',
  'hsl(var(--muted-foreground))',
];

/** Point on the radar for axis index `i` of `n` at radial fraction `r` (0..1). */
function radarPoint(i: number, n: number, r: number): { x: number; y: number } {
  // Start at 12 o'clock, go clockwise.
  const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * r,
    y: CENTER + Math.sin(angle) * RADIUS * r,
  };
}

function polygonPoints(values: number[]): string {
  const n = values.length;
  return values
    .map((v, i) => {
      const p = radarPoint(i, n, Math.max(0, Math.min(1, v)));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

export interface TeamCompareProps {
  teams: CompareTeam[];
  testid?: string;
}

/**
 * Radar overlay of 2–6 teams across the key scouting+EPA metrics. Degrades to
 * the shared EmptyChart when fewer than 2 teams are selected. Teams beyond
 * MAX_COMPARE_TEAMS are dropped (the caller already caps selection).
 */
export function TeamCompare({ teams, testid = 'team-compare' }: TeamCompareProps): JSX.Element {
  const capped = teams.slice(0, MAX_COMPARE_TEAMS);

  if (capped.length < 2) {
    return (
      <EmptyChart testid={`${testid}-empty`} message="Select at least 2 teams to compare." />
    );
  }

  const series = buildCompareSeries(capped, COMPARE_AXES);
  const axes = COMPARE_AXES;
  const n = axes.length;

  // Concentric grid rings (fractions 1/RINGS … 1).
  const rings = Array.from({ length: RINGS }, (_, i) => (i + 1) / RINGS);

  return (
    <div data-testid={testid} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="block aspect-square w-full max-w-[260px] shrink-0 self-center tabular-nums"
        role="img"
        aria-label={`Radar comparison of teams ${capped.map((t) => t.agg.teamNumber).join(', ')}`}
      >
        {/* Grid rings */}
        {rings.map((r) => (
          <polygon
            key={`ring-${r}`}
            points={polygonPoints(Array(n).fill(r))}
            fill="none"
            stroke={CHART_COLORS.border}
            strokeWidth={0.5}
          />
        ))}

        {/* Axis spokes + labels */}
        {axes.map((axis, i) => {
          const tip = radarPoint(i, n, 1);
          const lbl = radarPoint(i, n, 1.16);
          const anchor =
            Math.abs(lbl.x - CENTER) < 6 ? 'middle' : lbl.x > CENTER ? 'start' : 'end';
          return (
            <g key={axis.key}>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={tip.x}
                y2={tip.y}
                stroke={CHART_COLORS.border}
                strokeWidth={0.5}
              />
              <text
                x={lbl.x}
                y={lbl.y}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={9}
                fill={CHART_COLORS.axis}
              >
                {axis.label}
              </text>
            </g>
          );
        })}

        {/* Team polygons (overlay) */}
        {series.map((s) => {
          const color = RADAR_PALETTE[s.colorIndex % RADAR_PALETTE.length];
          return (
            <polygon
              key={s.teamNumber}
              data-testid={`${testid}-poly-${s.teamNumber}`}
              points={polygonPoints(s.values)}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <ul
        data-testid={`${testid}-legend`}
        className="flex flex-wrap gap-x-4 gap-y-1 sm:flex-col sm:gap-y-2"
      >
        {series.map((s) => (
          <li key={s.teamNumber} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: RADAR_PALETTE[s.colorIndex % RADAR_PALETTE.length] }}
            />
            <span className="font-medium tabular-nums text-brand">{s.teamNumber}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeamCompare;
