// src/dash/setActiveEvent.ts — make an event the single active one. Flips the
// server `is_active` flag (exclusive), persists locally, and updates the query
// cache so the dashboard reflects it immediately without a flicker.
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { setStoredActiveEvent } from './activeEventStore';
import { ACTIVE_EVENT_KEY } from './useActiveEvent';

export async function setActiveEvent(
  eventKey: string,
  queryClient?: QueryClient,
): Promise<void> {
  // Exactly one active event, flipped ATOMICALLY by the set_active_event RPC
  // (migration 0037). The old two-UPDATE approach (clear all, then set one) left a
  // window in which a concurrent reader could observe ZERO active events, so the
  // scout picker / dashboard briefly read "no active event". A single
  // `update event set is_active = (event_key = p_event_key)` rewrites every row in
  // one statement, so a reader always sees exactly one active event.
  const { error } = await supabase.rpc('set_active_event', { p_event_key: eventKey });
  if (error) throw error;

  setStoredActiveEvent(eventKey);
  queryClient?.setQueryData(ACTIVE_EVENT_KEY, eventKey);
}
