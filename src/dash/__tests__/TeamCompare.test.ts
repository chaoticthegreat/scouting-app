// src/dash/__tests__/TeamCompare.test.ts
// Unit tests for the pure radar-normalization helper buildCompareSeries.

import { describe, it, expect } from 'vitest';
import { emptyTeamAgg, type TeamAgg } from '@/dash/aggregate';
import {
  buildCompareSeries,
  COMPARE_AXES,
  type CompareTeam,
} from '@/dash/TeamCompare';

function team(
  teamNumber: number,
  overrides: Partial<TeamAgg> = {},
  epa: number | null = null,
): CompareTeam {
  return { agg: { ...emptyTeamAgg(teamNumber), ...overrides }, epa };
}

const axisIndex = (key: string) => COMPARE_AXES.findIndex((a) => a.key === key);

describe('buildCompareSeries', () => {
  it('returns one series per team, preserving order + identity', () => {
    const series = buildCompareSeries([team(111), team(222), team(333)]);
    expect(series.map((s) => s.teamNumber)).toEqual([111, 222, 333]);
    expect(series.map((s) => s.colorIndex)).toEqual([0, 1, 2]);
  });

  it('emits one normalized value per axis, all within [0,1]', () => {
    const series = buildCompareSeries([
      team(1, { scoutingExpectedPoints: 40, climbSuccessRate: 0.5 }),
      team(2, { scoutingExpectedPoints: 20, climbSuccessRate: 1 }),
    ]);
    for (const s of series) {
      expect(s.values).toHaveLength(COMPARE_AXES.length);
      for (const v of s.values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('normalizes magnitude axes against the per-axis max among teams', () => {
    const ei = axisIndex('expPts');
    const series = buildCompareSeries([
      team(1, { scoutingExpectedPoints: 40 }),
      team(2, { scoutingExpectedPoints: 10 }),
    ]);
    // The max team pins the axis at 1; the other is the ratio.
    expect(series[0].values[ei]).toBeCloseTo(1);
    expect(series[1].values[ei]).toBeCloseTo(0.25);
  });

  it('passes rate axes through clamped to [0,1] without cross-team scaling', () => {
    const ci = axisIndex('climb');
    const series = buildCompareSeries([
      team(1, { climbSuccessRate: 0.5 }),
      team(2, { climbSuccessRate: 0.5 }),
    ]);
    // Both at 0.5 — a rate axis must NOT renormalize them both to 1.
    expect(series[0].values[ci]).toBeCloseTo(0.5);
    expect(series[1].values[ci]).toBeCloseTo(0.5);
  });

  it('uses a fixed 1..5 ceiling for the defense axis', () => {
    const di = axisIndex('defense');
    const series = buildCompareSeries([
      team(1, { avgDefenseRating: 5 }),
      team(2, { avgDefenseRating: 2.5 }),
    ]);
    expect(series[0].values[di]).toBeCloseTo(1);
    expect(series[1].values[di]).toBeCloseTo(0.5);
  });

  it('treats null/absent EPA as 0 on its axis (no NaN)', () => {
    const ei = axisIndex('epa');
    const series = buildCompareSeries([team(1, {}, 30), team(2, {}, null)]);
    expect(series[0].values[ei]).toBeCloseTo(1);
    expect(series[1].values[ei]).toBe(0);
  });

  it('yields all-zero magnitude spokes when every team is empty (no division blowup)', () => {
    const series = buildCompareSeries([team(1), team(2)]);
    const ei = axisIndex('expPts');
    expect(series[0].values[ei]).toBe(0);
    expect(series[1].values[ei]).toBe(0);
  });
});
