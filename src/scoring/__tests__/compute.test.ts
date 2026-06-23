// src/scoring/__tests__/compute.test.ts
import { describe, it, expect } from 'vitest';
import { computeAggregates } from '../compute';
import type { MatchReportInputs } from '../types';

describe('computeAggregates — multi-burst, boundary-straddle, round-half-up per window', () => {
  // Build a report whose bursts each carry their own pre-classified `window`.
  // Per the frozen semantics, fuel per burst = rate * (endMs - startMs) / 1000,
  // summed per window as a float, then rounded HALF-UP once per window.
  //
  // Straddle case: a burst tagged window='shift1' that physically spans the
  // shift1 lower boundary (10000ms). Window classification is by the burst's
  // declared `window` field; the boundary straddle exercises duration math.
  const input: MatchReportInputs = {
    schemaVersion: 1,
    inactiveFirst: true, // shift1 & shift3 INACTIVE; shift2 & shift4 ACTIVE
    climbLevel: 0,
    autoClimbLevel1: false,
    fuelBursts: [
      // auto: 4.5 fuel -> rounds half-up to 5
      { startMs: 0, endMs: 9000, rate: 0.5, window: 'auto' },
      // transition: 2.5 fuel -> rounds half-up to 3
      { startMs: 0, endMs: 5000, rate: 0.5, window: 'transition' },
      // shift1 (INACTIVE) straddling the 10000ms boundary: 8000..12000 @1.0 = 4.0 -> 4
      { startMs: 8000, endMs: 12000, rate: 1.0, window: 'shift1' },
      //   second shift1 burst: 1500..2000? No — keep within shift1 declared window.
      { startMs: 15000, endMs: 18000, rate: 0.5, window: 'shift1' }, // 1.5 -> shift1 float = 4.0+1.5 = 5.5 -> 6
      // shift2 (ACTIVE): 3.5 -> 4
      { startMs: 35000, endMs: 42000, rate: 0.5, window: 'shift2' },
      // shift3 (INACTIVE): 2.5 -> 3
      { startMs: 60000, endMs: 65000, rate: 0.5, window: 'shift3' },
      // shift4 (ACTIVE): 1.5 -> 2
      { startMs: 85000, endMs: 88000, rate: 0.5, window: 'shift4' },
      // endgame: 6.5 -> 7
      { startMs: 110000, endMs: 123000, rate: 0.5, window: 'endgame' },
    ],
  };

  const agg = computeAggregates(input);

  it('rounds auto half-up once per window', () => {
    expect(agg.autoFuel).toBe(5); // 4.5 -> 5
  });

  it('rounds endgame half-up once per window', () => {
    expect(agg.endgameFuel).toBe(7); // 6.5 -> 7
  });

  it('sums shift floats then rounds once per shift (straddle accumulates before rounding)', () => {
    // shift1 float = 4.0 + 1.5 = 5.5 -> 6
    // shift2 = 3.5 -> 4 ; shift3 = 2.5 -> 3 ; shift4 = 1.5 -> 2
    expect(agg.fuelByShift).toEqual([6, 4, 3, 2]);
  });

  it('teleopFuelActive = transition + active shifts (rounded per window)', () => {
    // transition 3 + shift2 4 + shift4 2 = 9
    expect(agg.teleopFuelActive).toBe(9);
  });

  it('teleopFuelInactive = inactive shifts (rounded per window)', () => {
    // shift1 6 + shift3 3 = 9
    expect(agg.teleopFuelInactive).toBe(9);
  });

  it('fuelPoints = sum of rounded fuel in ACTIVE windows * FUEL_POINTS', () => {
    // active = auto 5 + transition 3 + shift2 4 + shift4 2 + endgame 7 = 21
    expect(agg.fuelPoints).toBe(21);
  });
});

describe('computeAggregates — round-half-up boundary (.5 always up, not banker rounding)', () => {
  it('0.5 rounds to 1, not 0', () => {
    const agg = computeAggregates({
      schemaVersion: 1,
      inactiveFirst: false,
      climbLevel: 0,
      autoClimbLevel1: false,
      fuelBursts: [{ startMs: 0, endMs: 1000, rate: 0.5, window: 'auto' }], // 0.5
    });
    expect(agg.autoFuel).toBe(1);
  });

  it('empty bursts produce all-zero aggregates', () => {
    const agg = computeAggregates({
      schemaVersion: 1,
      inactiveFirst: true,
      climbLevel: 0,
      autoClimbLevel1: false,
      fuelBursts: [],
    });
    expect(agg).toEqual({
      autoFuel: 0,
      teleopFuelActive: 0,
      teleopFuelInactive: 0,
      endgameFuel: 0,
      fuelByShift: [0, 0, 0, 0],
      fuelPoints: 0,
    });
  });
});
