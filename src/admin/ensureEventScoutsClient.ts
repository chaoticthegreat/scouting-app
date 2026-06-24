// src/admin/ensureEventScoutsClient.ts
// Seeds per-event `scout` rows from the persistent roster so the lead can
// auto-generate/publish assignments for any imported event — even before any
// scouter has checked in on their device. Returns the event's full scout pool.
import { supabase } from '@/lib/supabase';
import type { AssignScout } from './types';

interface SeededScoutRow {
  id: string;
  display_name: string;
}

/**
 * Ensure every roster name has a `scout` row at the event, then return the
 * event's full scout pool as AssignScout[]. Idempotent.
 */
export async function ensureEventScoutsFromRoster(eventKey: string): Promise<AssignScout[]> {
  const { data, error } = await supabase.rpc('seed_event_scouts_from_roster', {
    p_event_key: eventKey,
  });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as SeededScoutRow[]).map((r) => ({ id: r.id, displayName: r.display_name }));
}
