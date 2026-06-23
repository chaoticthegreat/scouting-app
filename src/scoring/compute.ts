// src/scoring/compute.ts
import type { MatchReportInputs, MatchReportAggregates, MatchWindow } from './types';
import { SCORING } from './constants';
import { isWindowActive, shiftNumberOf } from './windows';

// Round half-up: 0.5 -> 1, 2.5 -> 3, -0.5 -> 0. Math.round already rounds
// half toward +Infinity for non-negative values, which is what we need here
// (fuel is always >= 0). Use an explicit half-up to be unambiguous.
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

function burstFuel(rate: number, startMs: number, endMs: number): number {
  return (rate * (endMs - startMs)) / 1000;
}

export function computeAggregates(input: MatchReportInputs): MatchReportAggregates {
  // Accumulate float fuel per window first.
  const floatByWindow: Record<MatchWindow, number> = {
    auto: 0,
    transition: 0,
    shift1: 0,
    shift2: 0,
    shift3: 0,
    shift4: 0,
    endgame: 0,
  };

  for (const b of input.fuelBursts) {
    floatByWindow[b.window] += burstFuel(b.rate, b.startMs, b.endMs);
  }

  // Round half-up ONCE per window.
  const roundedByWindow: Record<MatchWindow, number> = {
    auto: roundHalfUp(floatByWindow.auto),
    transition: roundHalfUp(floatByWindow.transition),
    shift1: roundHalfUp(floatByWindow.shift1),
    shift2: roundHalfUp(floatByWindow.shift2),
    shift3: roundHalfUp(floatByWindow.shift3),
    shift4: roundHalfUp(floatByWindow.shift4),
    endgame: roundHalfUp(floatByWindow.endgame),
  };

  const fuelByShift: [number, number, number, number] = [
    roundedByWindow.shift1,
    roundedByWindow.shift2,
    roundedByWindow.shift3,
    roundedByWindow.shift4,
  ];

  let teleopFuelActive = roundedByWindow.transition; // transition is always active teleop
  let teleopFuelInactive = 0;
  for (const w of ['shift1', 'shift2', 'shift3', 'shift4'] as const) {
    const n = shiftNumberOf(w)!;
    if (isWindowActive(w, input.inactiveFirst)) {
      teleopFuelActive += roundedByWindow[w];
    } else {
      teleopFuelInactive += roundedByWindow[w];
    }
    void n;
  }

  // fuelPoints = sum of rounded fuel in ACTIVE windows * FUEL_POINTS.
  // auto + transition + endgame always active; shiftN if active.
  let activeFuel = roundedByWindow.auto + roundedByWindow.transition + roundedByWindow.endgame;
  for (const w of ['shift1', 'shift2', 'shift3', 'shift4'] as const) {
    if (isWindowActive(w, input.inactiveFirst)) {
      activeFuel += roundedByWindow[w];
    }
  }
  const fuelPoints = activeFuel * SCORING.FUEL_POINTS;

  return {
    autoFuel: roundedByWindow.auto,
    teleopFuelActive,
    teleopFuelInactive,
    endgameFuel: roundedByWindow.endgame,
    fuelByShift,
    fuelPoints,
  };
}
