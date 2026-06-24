// src/dash/baseTeamStore.ts — the configurable "base team" (a.k.a. OUR team).
// Most of the app is built around team 3256, but for TESTING (e.g. exercising the
// live Nexus feed, the broadcast Next-Match view, or auto-assign on an event that
// 3256 isn't registered at) it's useful to pivot the whole app onto a different
// base team. This persists that choice in localStorage so it survives reloads.
//
// Read it via getStoredBaseTeam() (always returns a valid team number, falling
// back to DEFAULT_BASE_TEAM); set it from the Setup tab via setStoredBaseTeam().
import { OUR_TEAM } from '@/dash/constants';

const KEY = 'base_team_number';

/** The default base team when nothing is stored (our real team, 3256). */
export const DEFAULT_BASE_TEAM = OUR_TEAM;

/** The configured base team, or the default when unset/unreadable/invalid. */
export function getStoredBaseTeam(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_BASE_TEAM;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_BASE_TEAM;
  } catch {
    return DEFAULT_BASE_TEAM;
  }
}

/** Persist the base team. Pass a positive integer to set, or null to reset to default. */
export function setStoredBaseTeam(team: number | null): void {
  try {
    if (team != null && Number.isInteger(team) && team > 0) {
      localStorage.setItem(KEY, String(team));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    /* storage unavailable — non-fatal */
  }
}
