// src/capture/onDeck.ts
// Pure selector for the scout "You're on deck" alert. Given the scout's
// not-yet-scouted assignments (already in play/schedule order, soonest first)
// and an optional Nexus live-field snapshot, pick the SINGLE most-urgent
// imminent match and explain why.
//
// Priority of the live signal mirrors how the field actually queues:
//   on field  > on deck  > now queuing  > (schedule) imminent-by-time
//
// Everything here is pure + injectable so it's unit-testable without rendering
// or hitting the network. The Nexus read is intentionally lightweight (label
// suffix + level-prefix match) so it degrades to schedule order when Nexus is
// unavailable — we do NOT pull in the heavier dash `nexusMatchesRow` resolver.

import type { NexusEventStatus, NexusMatch } from '@/dash/nexusClient';

/** How imminent the scout's next match is, most urgent first. */
export type OnDeckUrgency = 'on-field' | 'on-deck' | 'queuing' | 'soon';

export interface OnDeckMatch {
  match_key: string;
  alliance_color: 'red' | 'blue';
  station: 1 | 2 | 3;
  target_team_number: number;
}

export interface OnDeckResult<A extends OnDeckMatch> {
  assignment: A;
  urgency: OnDeckUrgency;
  /** Live status text straight from Nexus, when that's the driver (else null). */
  liveStatus: string | null;
}

/** Parse the trailing "qm73"/"sf1" segment out of a key like "2026casnv_qm73". */
function parseMatchKeyParts(key: string): { comp: string; num: number } | null {
  const tail = key.split('_').pop() ?? key;
  const m = /^([a-z]+)(\d+)$/i.exec(tail);
  if (!m) return null;
  return { comp: m[1].toLowerCase(), num: Number(m[2]) };
}

/**
 * Find the Nexus match for a schedule key by trailing number + shared level
 * prefix. Nexus labels ("Qualification 73") differ from our keys ("..._qm73"),
 * so we match defensively: same trailing number AND same first letter
 * ('q'/'s'/'f'). Returns the live status string (lowercased) or null.
 */
export function nexusStatusForKey(status: NexusEventStatus | null, key: string): string | null {
  if (!status) return null;
  const parts = parseMatchKeyParts(key);
  if (!parts) return null;
  const levelHint = parts.comp.charAt(0).toLowerCase();
  const hit: NexusMatch | undefined = status.matches.find((nm) => {
    const lbl = nm.label.trim().toLowerCase();
    return lbl.endsWith(` ${parts.num}`) && lbl.startsWith(levelHint);
  });
  return hit ? (hit.status ?? '').trim().toLowerCase() : null;
}

/** Map a normalized Nexus status string to an urgency rank, or null if not live. */
function urgencyFromStatus(s: string | null): OnDeckUrgency | null {
  switch (s) {
    case 'on field':
      return 'on-field';
    case 'on deck':
      return 'on-deck';
    case 'now queuing':
      return 'queuing';
    default:
      return null;
  }
}

const URGENCY_RANK: Record<OnDeckUrgency, number> = {
  'on-field': 0,
  'on-deck': 1,
  queuing: 2,
  soon: 3,
};

/**
 * Pick the single most-urgent imminent assignment for the on-deck alert.
 *
 * - When Nexus is available, any assigned match flagged on-field / on-deck /
 *   now-queuing wins (most urgent of those, ties broken by the incoming order).
 * - Otherwise (or when Nexus flags none of ours), fall back to the SCHEDULE: if
 *   the soonest assignment's scheduled time is within `soonMs`, flag it 'soon'.
 *
 * `assignments` is expected already sorted soonest-first (the caller's todo
 * list). `scheduledTimeOf` reads the match's scheduled_time (ISO) for an
 * assignment, or null when unknown/offline. `now` is injectable for tests.
 *
 * Returns null when nothing is imminent.
 */
export function selectOnDeck<A extends OnDeckMatch>(
  assignments: A[],
  status: NexusEventStatus | null,
  scheduledTimeOf: (a: A) => string | null,
  opts: { now?: number; soonMs?: number } = {},
): OnDeckResult<A> | null {
  const soonMs = opts.soonMs ?? 8 * 60 * 1000; // within ~8 min counts as "soon"

  // 1) Live Nexus signal — scan all assignments, keep the most urgent live one.
  let best: OnDeckResult<A> | null = null;
  if (status) {
    for (const a of assignments) {
      const live = nexusStatusForKey(status, a.match_key);
      const urgency = urgencyFromStatus(live);
      if (!urgency) continue;
      if (!best || URGENCY_RANK[urgency] < URGENCY_RANK[best.urgency]) {
        best = { assignment: a, urgency, liveStatus: live };
      }
    }
    if (best) return best;
  }

  // 2) Schedule fallback — the soonest assignment, if its time is near now.
  const now = opts.now ?? Date.now();
  const head = assignments[0];
  if (!head) return null;
  const iso = scheduledTimeOf(head);
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // Imminent = starts within soonMs from now and is not already long past.
  if (t - now <= soonMs && now - t <= soonMs) {
    return { assignment: head, urgency: 'soon', liveStatus: null };
  }
  return null;
}

/** Short human label for the urgency, used in the banner headline. */
export function onDeckHeadline(urgency: OnDeckUrgency): string {
  switch (urgency) {
    case 'on-field':
      return 'Your match is ON FIELD';
    case 'on-deck':
      return "You're on deck";
    case 'queuing':
      return 'Your match is queuing';
    case 'soon':
      return 'Your match is up soon';
  }
}
