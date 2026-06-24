// src/dash/__tests__/SeasonStats.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SeasonStats, {
  inHouseEpaForTeam,
  parseStatboticsTeamYear,
} from '@/dash/SeasonStats';
import type { MatchRow } from '@/dash/useEventData';

let seq = 0;
function match(o: Partial<MatchRow>): MatchRow {
  seq += 1;
  return {
    match_key: `2026evt_qm${o.match_number ?? seq}`,
    event_key: '2026evt',
    comp_level: 'qm',
    match_number: o.match_number ?? seq,
    scheduled_time: null,
    red1: null,
    red2: null,
    red3: null,
    blue1: null,
    blue2: null,
    blue3: null,
    actual_red_score: null,
    actual_blue_score: null,
    winner: null,
    result_synced_at: null,
    ...o,
  };
}

beforeEach(() => {
  cleanup();
});

describe('inHouseEpaForTeam', () => {
  const played: MatchRow[] = [
    match({
      match_number: 1,
      red1: 1,
      red2: 2,
      red3: 3,
      blue1: 4,
      blue2: 5,
      blue3: 6,
      actual_red_score: 90,
      actual_blue_score: 60,
    }),
    match({
      match_number: 2,
      red1: 1,
      red2: 7,
      red3: 8,
      blue1: 4,
      blue2: 9,
      blue3: 10,
      actual_red_score: 110,
      actual_blue_score: 50,
    }),
  ];

  it('returns a finite number for a participating team', () => {
    const epa = inHouseEpaForTeam(played, 1);
    expect(epa).not.toBeNull();
    expect(Number.isFinite(epa as number)).toBe(true);
  });

  it('returns null for a team absent from all matches', () => {
    expect(inHouseEpaForTeam(played, 9999)).toBeNull();
  });

  it('returns null for empty matches', () => {
    expect(inHouseEpaForTeam([], 1)).toBeNull();
  });
});

describe('parseStatboticsTeamYear', () => {
  it('reads worldRank, totalEpa, and record from a realistic object', () => {
    const json = {
      team: 3256,
      year: 2026,
      epa: {
        total_points: { mean: 42.7 },
        ranks: { total: { rank: 18 } },
        breakdown: { total_points: 41.0 },
      },
      record: { wins: 12, losses: 3, ties: 1 },
    };
    expect(parseStatboticsTeamYear(json)).toEqual({
      worldRank: 18,
      totalEpa: 42.7,
      record: '12-3-1',
    });
  });

  it('falls back to epa.breakdown.total_points when mean is missing', () => {
    const json = {
      epa: {
        total_points: {},
        breakdown: { total_points: 33.3 },
        ranks: { total: { rank: 5 } },
      },
      record: { wins: 1, losses: 0, ties: 0 },
    };
    const out = parseStatboticsTeamYear(json);
    expect(out.totalEpa).toBe(33.3);
    expect(out.worldRank).toBe(5);
  });

  it('returns all-null for garbage input without throwing', () => {
    expect(parseStatboticsTeamYear(null)).toEqual({
      worldRank: null,
      totalEpa: null,
      record: null,
    });
    expect(parseStatboticsTeamYear('nope')).toEqual({
      worldRank: null,
      totalEpa: null,
      record: null,
    });
    expect(parseStatboticsTeamYear(42)).toEqual({
      worldRank: null,
      totalEpa: null,
      record: null,
    });
  });

  it('returns nulls for missing nested fields without throwing', () => {
    expect(parseStatboticsTeamYear({})).toEqual({
      worldRank: null,
      totalEpa: null,
      record: null,
    });
    expect(parseStatboticsTeamYear({ epa: {} })).toEqual({
      worldRank: null,
      totalEpa: null,
      record: null,
    });
    // Partial record → null (needs all three of wins/losses/ties).
    expect(parseStatboticsTeamYear({ record: { wins: 2, losses: 1 } }).record).toBeNull();
    // Non-finite values → null.
    expect(
      parseStatboticsTeamYear({ epa: { total_points: { mean: Infinity } } }).totalEpa,
    ).toBeNull();
  });
});

describe('SeasonStats rendering', () => {
  it('shows statbotics values and NO in-house badge', () => {
    render(
      <SeasonStats
        team={3256}
        worldRank={18}
        totalEpa={42.7}
        epaSource="statbotics"
        seasonRecord="12-3-1"
      />,
    );
    expect(screen.getByTestId('dash-season-rank')).toBeTruthy();
    expect(screen.getByTestId('dash-season-record').textContent).toBe('12-3-1');
    expect(screen.getByTestId('dash-season-world-rank').textContent).toBe('#18');
    expect(screen.getByTestId('dash-season-epa').textContent).toBe('42.7');
    expect(screen.queryByTestId('dash-season-epa-source')).toBeNull();
  });

  it('shows the in-house badge when epaSource is inhouse', () => {
    render(
      <SeasonStats
        team={3256}
        worldRank={null}
        totalEpa={29.4}
        epaSource="inhouse"
        seasonRecord={null}
      />,
    );
    expect(screen.getByTestId('dash-season-epa').textContent).toBe('29.4');
    const badge = screen.getByTestId('dash-season-epa-source');
    expect(badge.textContent).toMatch(/in-house/i);
    // World rank and record fall back to em-dash.
    expect(screen.getByTestId('dash-season-world-rank').textContent).toBe('—');
    expect(screen.getByTestId('dash-season-record').textContent).toBe('—');
  });

  it('renders em-dash for null EPA and shows no badge for source none', () => {
    render(
      <SeasonStats
        team={3256}
        worldRank={null}
        totalEpa={null}
        epaSource="none"
        seasonRecord={null}
      />,
    );
    expect(screen.getByTestId('dash-season-epa').textContent).toBe('—');
    expect(screen.queryByTestId('dash-season-epa-source')).toBeNull();
  });
});
