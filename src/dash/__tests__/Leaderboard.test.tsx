// src/dash/__tests__/Leaderboard.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Leaderboard, {
  parseTbaRankings,
  EventRankSummary,
  type RankRow,
} from '@/dash/Leaderboard';

beforeEach(() => {
  cleanup();
});

/** A realistic TBA `/event/{key}/rankings` payload, plus one malformed row. */
const tbaPayload = {
  rankings: [
    {
      rank: 2,
      team_key: 'frc3256',
      record: { wins: 7, losses: 2, ties: 1 },
      sort_orders: [2.111, 88, 12],
      matches_played: 10,
    },
    {
      rank: 1,
      team_key: 'frc254',
      record: { wins: 10, losses: 0, ties: 0 },
      sort_orders: [3.5, 120, 30],
    },
    {
      rank: 3,
      team_key: 'frc1678',
      // No record object: should fall back to matches_played for games.
      sort_orders: [2.0],
      matches_played: 8,
    },
    // Malformed: team_key doesn't match /^frc(\d+)$/ — must be skipped.
    {
      rank: 4,
      team_key: 'ftc9999',
      record: { wins: 1, losses: 1, ties: 0 },
      sort_orders: [1.0],
    },
  ],
};

describe('parseTbaRankings', () => {
  it('parses a realistic payload into sorted RankRow[], skipping malformed rows', () => {
    const rows = parseTbaRankings(tbaPayload);

    // Malformed (ftc9999) skipped; sorted ascending by rank.
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.teamNumber)).toEqual([254, 3256, 1678]);

    const [first, second, third] = rows;

    // Rank 1: frc254
    expect(first.teamNumber).toBe(254);
    expect(first.rp).toBe(3.5);
    expect(first.record).toBe('10-0-0');
    expect(first.wins).toBe(10);
    expect(first.losses).toBe(0);
    expect(first.ties).toBe(0);
    expect(first.total).toBe(Math.round(3.5 * 10)); // 35

    // Rank 2: frc3256
    expect(second.teamNumber).toBe(3256);
    expect(second.rp).toBe(2.111);
    expect(second.record).toBe('7-2-1');
    expect(second.total).toBe(Math.round(2.111 * 10)); // 21

    // Rank 3: frc1678 — no record, games come from matches_played (8).
    expect(third.teamNumber).toBe(1678);
    expect(third.rp).toBe(2.0);
    expect(third.record).toBe('0-0-0');
    expect(third.total).toBe(Math.round(2.0 * 8)); // 16

    // None of these rows carry a real TBA total field → all flagged approximate.
    expect(rows.every((r) => r.totalApprox)).toBe(true);
  });

  it('uses a REAL TBA total when present (extra_stats / total_rp) and flags it exact', () => {
    const rows = parseTbaRankings({
      rankings: [
        // total_rp wins over the reconstruction (which would be round(2.5*4)=10).
        { rank: 1, team_key: 'frc11', sort_orders: [2.5], record: { wins: 2, losses: 1, ties: 1 }, total_rp: 9 },
        // extra_stats[0] is the running total in many real payloads.
        { rank: 2, team_key: 'frc22', sort_orders: [2.0], record: { wins: 2, losses: 2, ties: 0 }, extra_stats: [13] },
      ],
    });
    expect(rows[0].total).toBe(9);
    expect(rows[0].totalApprox).toBe(false);
    expect(rows[1].total).toBe(13);
    expect(rows[1].totalApprox).toBe(false);
  });

  it('never throws on garbage input', () => {
    expect(parseTbaRankings(null)).toEqual([]);
    expect(parseTbaRankings(undefined)).toEqual([]);
    expect(parseTbaRankings(42)).toEqual([]);
    expect(parseTbaRankings({})).toEqual([]);
    expect(parseTbaRankings({ rankings: 'nope' })).toEqual([]);
    expect(parseTbaRankings({ rankings: [{ rank: 'x', team_key: 'frc1' }] })).toEqual([]);
  });

  it('defaults rp to 0 when sort_orders is missing or non-finite', () => {
    const rows = parseTbaRankings({
      rankings: [{ rank: 1, team_key: 'frc9', record: { wins: 1, losses: 0, ties: 0 } }],
    });
    expect(rows[0].rp).toBe(0);
    expect(rows[0].total).toBe(0);
  });
});

const sampleRows: RankRow[] = [
  { rank: 1, teamNumber: 254, rp: 3.5, total: 35, totalApprox: true, record: '10-0-0', wins: 10, losses: 0, ties: 0 },
  { rank: 2, teamNumber: 3256, rp: 2.111, total: 21, totalApprox: true, record: '7-2-1', wins: 7, losses: 2, ties: 1 },
  { rank: 3, teamNumber: 1678, rp: 2.0, total: 16, totalApprox: true, record: '8-0-0', wins: 8, losses: 0, ties: 0 },
];

describe('Leaderboard', () => {
  it('renders a row per team and highlights the ourTeam row', () => {
    render(<Leaderboard rows={sampleRows} ourTeam={3256} />);

    expect(screen.getByTestId('dash-leaderboard')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-row-254')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-row-1678')).toBeInTheDocument();

    const ourRow = screen.getByTestId('leaderboard-row-3256');
    expect(ourRow).toHaveAttribute('data-our', 'true');

    // Non-our rows do not carry the marker.
    expect(screen.getByTestId('leaderboard-row-254')).not.toHaveAttribute('data-our');
  });

  it('shows RP to 3 decimals', () => {
    render(<Leaderboard rows={sampleRows} ourTeam={3256} />);
    expect(screen.getByText('2.111')).toBeInTheDocument();
    expect(screen.getByText('3.500')).toBeInTheDocument();
  });

  it('renders the empty state for []', () => {
    render(<Leaderboard rows={[]} ourTeam={3256} />);
    expect(screen.getByTestId('dash-leaderboard-empty')).toBeInTheDocument();
    expect(screen.getByText('No rankings available yet.')).toBeInTheDocument();
  });
});

describe('EventRankSummary', () => {
  it('shows correct values for a given row', () => {
    render(<EventRankSummary row={sampleRows[1]} teamCount={40} />);

    expect(screen.getByTestId('dash-event-rank')).toBeInTheDocument();
    expect(screen.getByTestId('dash-event-record')).toHaveTextContent('7-2-1');
    expect(screen.getByTestId('dash-event-rank-value')).toHaveTextContent('2 / 40');
    expect(screen.getByTestId('dash-event-avg-rp')).toHaveTextContent('2.111');
  });

  it('omits the team count when it is null', () => {
    render(<EventRankSummary row={sampleRows[0]} teamCount={null} />);
    expect(screen.getByTestId('dash-event-rank-value')).toHaveTextContent('1');
    expect(screen.getByTestId('dash-event-rank-value')).not.toHaveTextContent('/');
  });

  it("shows '—' for every value when row is null", () => {
    render(<EventRankSummary row={null} teamCount={40} />);
    expect(screen.getByTestId('dash-event-record')).toHaveTextContent('—');
    expect(screen.getByTestId('dash-event-rank-value')).toHaveTextContent('—');
    expect(screen.getByTestId('dash-event-avg-rp')).toHaveTextContent('—');
  });
});
