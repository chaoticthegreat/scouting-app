// src/roster/scoutIdentityCache.ts
//
// A durable, device-local map of (event_key, display_name) -> ScoutRow so a
// scouter can re-select their own name OFFLINE and recover their REAL
// server-side scout row — i.e. the right `scout_id`, so their cached
// assignments load and any reports they capture still sync once they're back
// online.
//
// Why this exists separately from `cached_scout_row` (useSession): that key is
// deliberately CLEARED on log-out so a stale profile isn't resurrected. But the
// whole point of this cache is the opposite — to let an *accidentally logged
// out* scout get back into their assignments with no wifi. So this map MUST
// survive log-out. It's only ever populated from a row the server already
// confirmed (a successful select_scouter, or a useSession resolve), so it never
// invents an identity; offline it can only restore names this device has
// genuinely signed in as before while online.
import type { ScoutRow } from '@/auth/scoutRow';

const KEY = 'scout_identity_cache_v1';

type IdentityMap = Record<string, ScoutRow>;

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function keyFor(eventKey: string, name: string): string {
  return `${eventKey}::${normName(name)}`;
}

function readAll(): IdentityMap {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as IdentityMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: IdentityMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal; offline recovery
       for this name just won't be available until the next online sign-in. */
  }
}

/**
 * Remember a server-confirmed scout row so its name can be re-picked offline.
 * Keyed by (event_key, normalized name). Safe no-op for malformed rows.
 */
export function rememberScoutIdentity(row: ScoutRow | null | undefined): void {
  if (!row || !row.event_key || !row.display_name) return;
  const map = readAll();
  map[keyFor(row.event_key, row.display_name)] = row;
  writeAll(map);
}

/**
 * The cached scout row for (eventKey, name), or null when this device has never
 * resolved that name online. Callers use this as the offline fallback when the
 * select_scouter RPC can't reach the server.
 */
export function getCachedScoutIdentity(eventKey: string, name: string): ScoutRow | null {
  const map = readAll();
  return map[keyFor(eventKey, name)] ?? null;
}

/**
 * Reverse lookup: the server-confirmed display name for a given `scout_id`, or
 * null when this device has never cached that id. Used by the QR sender to tag
 * each outbound report with its scouter NAME — the receiver's ingest path can't
 * resolve a foreign device's `scout_id` (those rows are per-device and get
 * consolidated by select_scouter), but it CAN re-attach the report to the right
 * scouter by name. Best-effort: a miss just means the report ingests under a
 * generic "Imported scout" identity instead of failing.
 */
export function getCachedDisplayNameForScoutId(scoutId: string): string | null {
  if (!scoutId) return null;
  const map = readAll();
  for (const row of Object.values(map)) {
    if (row?.id === scoutId && row.display_name) return row.display_name;
  }
  return null;
}
