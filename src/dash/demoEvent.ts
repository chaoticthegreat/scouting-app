// src/dash/demoEvent.ts — "demo mode": spin up a fully-populated simulated event
// (fake teams, matches with scores, scouts, hundreds of scouting + pit reports)
// so every dashboard feature can be explored without a live event. Seeding is
// done server-side by the idempotent `seed_demo_event` RPC; we then activate the
// event and invalidate all queries so the dashboard refetches against it.
// Teardown reuses the existing `delete_event` wrapper.
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { setActiveEvent } from './setActiveEvent';
import { deleteEvent } from './deleteEvent';

export const DEMO_EVENT_KEY = '2026demo';

export function isDemoEvent(key: string | null): boolean {
  return key === DEMO_EVENT_KEY;
}

/**
 * Seed the demo event (idempotent), make it the active event, and invalidate all
 * queries so every dashboard read refetches against the freshly-seeded data.
 */
export async function enableDemoMode(queryClient?: QueryClient): Promise<void> {
  const { error } = await supabase.rpc('seed_demo_event', {
    p_event_key: DEMO_EVENT_KEY,
  });
  if (error) throw new Error(`Failed to seed demo event: ${error.message}`);

  await setActiveEvent(DEMO_EVENT_KEY, queryClient);
  await queryClient?.invalidateQueries();
}

/**
 * Tear down the demo event and all of its data, then invalidate all queries so the
 * dashboard stops pointing at the now-deleted event.
 */
export async function disableDemoMode(queryClient?: QueryClient): Promise<void> {
  await deleteEvent(DEMO_EVENT_KEY, queryClient);
  await queryClient?.invalidateQueries();
}
