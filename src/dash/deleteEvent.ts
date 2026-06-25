// src/dash/deleteEvent.ts — permanently remove an imported event and ALL of its
// data (matches, scouts, reports, assignments, pit reports). Calls the
// `delete_event` SECURITY DEFINER RPC (migration 0017). If the removed event was
// the active one, clears the locally-stored active event and the query cache so
// the dashboard doesn't keep pointing at a now-deleted key.
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getStoredActiveEvent, setStoredActiveEvent } from './activeEventStore';
import { ACTIVE_EVENT_KEY } from './useActiveEvent';

export async function deleteEvent(
  eventKey: string,
  queryClient?: QueryClient,
): Promise<void> {
  const { error } = await supabase.rpc('delete_event', { p_event_key: eventKey });
  if (error) throw new Error(error.message);

  // If we just deleted the active event, drop the stale local/cache pointer so
  // useActiveEvent resolves to "none" instead of re-seeding the dead key.
  if (getStoredActiveEvent() === eventKey) {
    setStoredActiveEvent(null);
    queryClient?.setQueryData(ACTIVE_EVENT_KEY, null);
  }
}
