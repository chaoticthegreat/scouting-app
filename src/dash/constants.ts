// src/dash/constants.ts
// Site of record for the analytics tuning constants (contracts §9).

/** Matches-scouted needed to fully trust our scouting data over EPA. */
export const CONFIDENCE_N = 4;

// Win-probability calibration.
//
// Win prob is logistic over the predicted score margin, but the SPREAD of FRC
// match margins grows with the scoring level of the game. A fixed points-based
// steepness (the old WINPROB_K) over-commits in high-scoring games: in REBUILT,
// where an alliance scores ~400, a 20-point edge is a near coin-flip, not an 85%
// lock. So instead of a constant steepness we normalize the margin by an
// estimated match-margin standard deviation derived from the total predicted
// score: sigma ≈ WINPROB_SIGMA_FRACTION * (redScore + blueScore), floored.
//
//   redWinProb = logistic( WINPROB_LOGIT_SCALE * (redScore - blueScore) / sigma )
//
// This self-calibrates across seasons/score scales from the predicted totals.

/** Margin standard deviation as a fraction of the total predicted alliance score. */
export const WINPROB_SIGMA_FRACTION = 0.11;

/** Floor on the margin SD so low-scoring totals don't produce an over-steep curve. */
export const WINPROB_SIGMA_FLOOR = 12;

/** Probit→logit factor: logistic(1.7·z) ≈ Φ(z), so a logistic curve mimics a normal CDF. */
export const WINPROB_LOGIT_SCALE = 1.7;

/** Our team: never scouted (EPA-only in predictions, omitted from our auto overlay). */
export const OUR_TEAM = 3256;

/**
 * Poll interval (ms) for LIVE Nexus field status. Nexus reports what is queuing /
 * on the field right now, so the dashboard re-fetches on this cadence to keep the
 * On-Field / Queuing tiles advancing as matches play. Kept short for near-real-time
 * liveness; the nexus-proxy is uncached so every poll reflects the current field.
 */
export const NEXUS_POLL_MS = 10_000;
