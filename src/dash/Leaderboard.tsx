// src/dash/Leaderboard.tsx
// Broadcast-style official event LEADERBOARD, fed by The Blue Alliance rankings.
// PURE + presentational: props in → JSX out (no fetching, no QueryClient). The
// orchestrator fetches `/event/{key}/rankings` and passes the parsed rows in.
//
// Exports:
//   - parseTbaRankings(data): defensive parser, never throws.
//   - Leaderboard (default): the full ranking table Card.
//   - EventRankSummary: "Event Rankings" StatTiles for OUR team.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatTile } from '@/components/ui/StatTile';
import { cn } from '@/lib/utils';

const EM_DASH = '—';

/** A single resolved leaderboard row (one team's official standing). */
export interface RankRow {
  rank: number;
  teamNumber: number;
  rp: number; // ranking score (avg RP)
  total: number; // total ranking points (≈ rp * matchesPlayed), integer
  record: string; // "W-L-T"
  wins: number;
  losses: number;
  ties: number;
}

/** Standard TBA `/event/{key}/rankings` payload (every field read defensively). */
interface TbaRankingsResponse {
  rankings?: unknown;
}

/** Coerce an unknown into a finite number, or `fallback` when it isn't one. */
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Parse a TBA rankings payload into sorted `RankRow[]`. Never throws: malformed
 * rows (missing/garbled team_key or non-numeric rank) are skipped.
 */
export function parseTbaRankings(data: unknown): RankRow[] {
  if (typeof data !== 'object' || data === null) return [];
  const rankings = (data as TbaRankingsResponse).rankings;
  if (!Array.isArray(rankings)) return [];

  const rows: RankRow[] = [];
  for (const entry of rankings) {
    if (typeof entry !== 'object' || entry === null) continue;
    const r = entry as Record<string, unknown>;

    if (typeof r.rank !== 'number' || !Number.isFinite(r.rank)) continue;
    if (typeof r.team_key !== 'string') continue;
    const m = /^frc(\d+)$/.exec(r.team_key);
    if (!m) continue;
    const teamNumber = Number(m[1]);

    const sortOrders = Array.isArray(r.sort_orders) ? r.sort_orders : [];
    const rp = num(sortOrders[0], 0);

    const rec =
      typeof r.record === 'object' && r.record !== null
        ? (r.record as Record<string, unknown>)
        : null;
    const wins = rec ? num(rec.wins, 0) : 0;
    const losses = rec ? num(rec.losses, 0) : 0;
    const ties = rec ? num(rec.ties, 0) : 0;

    // Games played: prefer the record, fall back to matches_played when absent.
    const gamesPlayed = rec ? wins + losses + ties : num(r.matches_played, 0);
    const total = Math.round(rp * gamesPlayed);

    rows.push({
      rank: r.rank,
      teamNumber,
      rp,
      total,
      record: `${wins}-${losses}-${ties}`,
      wins,
      losses,
      ties,
    });
  }

  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

export interface LeaderboardProps {
  rows: RankRow[];
  ourTeam: number;
  className?: string;
}

/**
 * The official event leaderboard: a scrollable, broadcast-style table of every
 * ranked team. OUR team's row is highlighted.
 */
export default function Leaderboard(props: LeaderboardProps): JSX.Element {
  const { rows, ourTeam, className } = props;

  return (
    <div data-testid="dash-leaderboard" className={cn('text-foreground', className)}>
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div
              data-testid="dash-leaderboard-empty"
              className="p-6 text-sm text-muted-foreground"
            >
              No rankings available yet.
            </div>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Team</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">RP</th>
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Tot</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground">Rec</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOurs = row.teamNumber === ourTeam;
                    return (
                      <tr
                        key={row.teamNumber}
                        data-testid={`leaderboard-row-${row.teamNumber}`}
                        data-our={isOurs ? 'true' : undefined}
                        className={cn(
                          'border-b border-border/50',
                          isOurs ? 'bg-brand/15 font-semibold' : 'hover:bg-accent/30',
                        )}
                      >
                        <td className="px-2 py-2 tabular-nums">{row.rank}</td>
                        <td className="px-2 py-2 tabular-nums font-medium">{row.teamNumber}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.rp.toFixed(3)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.total}</td>
                        <td className="px-2 py-2 tabular-nums">{row.record}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export interface EventRankSummaryProps {
  /** OUR team's official row, or null when we're absent / rankings are missing. */
  row: RankRow | null;
  /** Total ranked teams at the event, or null when unknown. */
  teamCount: number | null;
}

/**
 * "Event Rankings" tiles for OUR team: record, rank (out of the field), avg RP.
 * Degrades to em-dashes when our row is unavailable.
 */
export function EventRankSummary(props: EventRankSummaryProps): JSX.Element {
  const { row, teamCount } = props;

  const record = row ? row.record : EM_DASH;
  const rankValue = row ? `${row.rank}${teamCount ? ` / ${teamCount}` : ''}` : EM_DASH;
  const avgRp = row ? row.rp.toFixed(3) : EM_DASH;

  return (
    <div data-testid="dash-event-rank" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile
        label="Event Record"
        tone="default"
        value={<span data-testid="dash-event-record">{record}</span>}
      />
      <StatTile
        label="Event Rank"
        tone="brand"
        value={<span data-testid="dash-event-rank-value">{rankValue}</span>}
      />
      <StatTile
        label="Avg RP"
        tone="energy"
        value={<span data-testid="dash-event-avg-rp">{avgRp}</span>}
      />
    </div>
  );
}
