// src/dash/__tests__/localEpa.test.ts
import { describe, it, expect } from 'vitest';
import { computeLocalEpa } from '@/dash/localEpa';
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

describe('computeLocalEpa', () => {
  it('returns an empty map when there are no played matches', () => {
    const matches = [
      match({ match_number: 1, red1: 1, red2: 2, red3: 3, blue1: 4, blue2: 5, blue3: 6 }),
    ];
    expect(computeLocalEpa(matches).size).toBe(0);
  });

  it('returns an empty map for an empty input', () => {
    expect(computeLocalEpa([]).size).toBe(0);
  });

  it('initializes every team to (mean alliance score)/3', () => {
    // One played match: red 90, blue 60. Mean alliance score = (90+60)/2 = 75.
    // init = 75/3 = 25.
    const matches = [
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
    ];
    const epa = computeLocalEpa(matches);
    // After one match every team has moved from init=25 by one update, but a team
    // that never appeared would sit exactly at init. Verify the init analog via a
    // team present only as a roster slot: all teams here played, so instead verify
    // the mean is centered around 25 by checking total is finite & near init range.
    for (const t of [1, 2, 3, 4, 5, 6]) {
      expect(Number.isFinite(epa.get(t) as number)).toBe(true);
    }
    // With one match and N=0 (K=0.5, M=0): redEPA=blueEPA=75 (3*25).
    // red delta = 0.5*((90-75)) = 7.5 -> red teams = 32.5
    // blue delta = 0.5*((60-75)) = -7.5 -> blue teams = 17.5
    expect(epa.get(1)).toBeCloseTo(32.5, 6);
    expect(epa.get(4)).toBeCloseTo(17.5, 6);
  });

  it('a team that consistently outscores rises above one that consistently loses', () => {
    // Team 1 always on the winning red alliance; team 4 always on the losing blue.
    const matches: MatchRow[] = [];
    for (let i = 1; i <= 8; i += 1) {
      matches.push(
        match({
          match_number: i,
          red1: 1,
          red2: 10 + i, // filler teammates vary so they don't anchor
          red3: 20 + i,
          blue1: 4,
          blue2: 30 + i,
          blue3: 40 + i,
          actual_red_score: 120,
          actual_blue_score: 40,
        }),
      );
    }
    const epa = computeLocalEpa(matches);
    expect(epa.get(1) as number).toBeGreaterThan(epa.get(4) as number);
    // The consistent winner should sit clearly above the init baseline.
    expect(epa.get(1) as number).toBeGreaterThan(40);
  });

  it('ignores null roster slots without throwing', () => {
    const matches = [
      match({
        match_number: 1,
        red1: 1,
        red2: null,
        red3: 3,
        blue1: 4,
        blue2: 5,
        blue3: null,
        actual_red_score: 50,
        actual_blue_score: 50,
      }),
    ];
    const epa = computeLocalEpa(matches);
    expect(epa.has(1)).toBe(true);
    expect(epa.has(3)).toBe(true);
    expect(epa.has(4)).toBe(true);
    // No NaN leaked from the null slots.
    for (const v of epa.values()) expect(Number.isNaN(v)).toBe(false);
  });

  it('processes matches in match_number order regardless of input order', () => {
    const a = match({
      match_number: 2,
      red1: 1,
      red2: 2,
      red3: 3,
      blue1: 4,
      blue2: 5,
      blue3: 6,
      actual_red_score: 100,
      actual_blue_score: 50,
    });
    const b = match({
      match_number: 1,
      red1: 1,
      red2: 2,
      red3: 3,
      blue1: 4,
      blue2: 5,
      blue3: 6,
      actual_red_score: 100,
      actual_blue_score: 50,
    });
    const out1 = computeLocalEpa([a, b]);
    const out2 = computeLocalEpa([b, a]);
    expect(out1.get(1)).toBeCloseTo(out2.get(1) as number, 10);
  });
});
