// src/dash/localEpa.ts
// A faithful, simplified Statbotics-style EPA computed purely from this event's
// played match results (actual scores + alliance rosters). Used as a fallback
// when Statbotics is offline so the next-match prediction still has a baseline.
//
// Algorithm (point-unit, offense-weighted by a margin M, Elo-like update):
//   * Consider only played matches (both actual scores non-null), in chronological
//     order (by match_number across the event).
//   * Initialize every team's EPA = (mean alliance score across played matches)/3.
//     Statbotics inits to Week-1-mean-score/3; we use this event's mean as the
//     local analog.
//   * Per-team learning rate K(N) and margin M(N), where N = matches that team has
//     played so far (pre-match):
//       K(N): N<=6 -> 0.5; 6<N<=12 -> 0.5 - (1/30)*(N-6); N>12 -> 0.3.
//       M(N): N<=12 -> 0; 12<N<=36 -> (1/24)*(N-12); N>36 -> 1.
//   * For each played match, snapshot redEPA = sum of the 3 red EPAs (pre-update),
//     blueEPA likewise, then for each team:
//       RED i:  ΔEPA = K(Ni) * 1/(1+M(Ni)) * ((redScore - redEPA) - M(Ni)*(blueScore - blueEPA))
//       BLUE i: ΔEPA = K(Ni) * 1/(1+M(Ni)) * ((blueScore - blueEPA) - M(Ni)*(redScore - redEPA))
//     All six updates use the SAME pre-match snapshot; apply, then increment each
//     team's N. Null roster slots are skipped.

import type { MatchRow } from '@/dash/useEventData';

function kOf(n: number): number {
  if (n <= 6) return 0.5;
  if (n <= 12) return 0.5 - (1 / 30) * (n - 6);
  return 0.3;
}

function mOf(n: number): number {
  if (n <= 12) return 0;
  if (n <= 36) return (1 / 24) * (n - 12);
  return 1;
}

function redOf(m: MatchRow): Array<number | null> {
  return [m.red1, m.red2, m.red3];
}
function blueOf(m: MatchRow): Array<number | null> {
  return [m.blue1, m.blue2, m.blue3];
}

function isPlayed(m: MatchRow): boolean {
  return m.actual_red_score != null && m.actual_blue_score != null;
}

/**
 * Compute a local EPA (total points) per team from played matches.
 * Returns an empty map when there are no played matches.
 */
export function computeLocalEpa(matches: MatchRow[]): Map<number, number> {
  const played = matches
    .filter(isPlayed)
    .slice()
    .sort((a, b) => a.match_number - b.match_number);

  const epa = new Map<number, number>();
  if (played.length === 0) return epa;

  // Init value: mean alliance score across played matches / 3.
  let scoreSum = 0;
  let scoreCount = 0;
  for (const m of played) {
    scoreSum += (m.actual_red_score as number) + (m.actual_blue_score as number);
    scoreCount += 2; // two alliance scores per match
  }
  const init = scoreSum / scoreCount / 3;

  const nByTeam = new Map<number, number>();
  const ensure = (team: number): void => {
    if (!epa.has(team)) {
      epa.set(team, init);
      nByTeam.set(team, 0);
    }
  };

  for (const m of played) {
    const reds = redOf(m).filter((t): t is number => t != null);
    const blues = blueOf(m).filter((t): t is number => t != null);
    for (const t of [...reds, ...blues]) ensure(t);

    const redScore = m.actual_red_score as number;
    const blueScore = m.actual_blue_score as number;

    // Pre-match snapshot used for ALL six updates.
    const redEPA = reds.reduce((s, t) => s + (epa.get(t) as number), 0);
    const blueEPA = blues.reduce((s, t) => s + (epa.get(t) as number), 0);

    const deltas: Array<[number, number]> = [];

    for (const t of reds) {
      const n = nByTeam.get(t) as number;
      const k = kOf(n);
      const mm = mOf(n);
      const delta = k * (1 / (1 + mm)) * ((redScore - redEPA) - mm * (blueScore - blueEPA));
      deltas.push([t, delta]);
    }
    for (const t of blues) {
      const n = nByTeam.get(t) as number;
      const k = kOf(n);
      const mm = mOf(n);
      const delta = k * (1 / (1 + mm)) * ((blueScore - blueEPA) - mm * (redScore - redEPA));
      deltas.push([t, delta]);
    }

    // Apply all deltas (from the snapshot), then bump N.
    for (const [t, delta] of deltas) {
      epa.set(t, (epa.get(t) as number) + delta);
    }
    for (const t of [...reds, ...blues]) {
      nByTeam.set(t, (nByTeam.get(t) as number) + 1);
    }
  }

  return epa;
}
