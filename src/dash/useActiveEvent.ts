import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getStoredActiveEvent, setStoredActiveEvent } from './activeEventStore';

export const ACTIVE_EVENT_KEY = ['active-event'] as const;

/**
 * How often (ms) to re-resolve the active event as a safety net. The active
 * event is a global singleton a lead can flip from ANOTHER device; without a
 * re-resolve this browser would render the old event's data tabs until a manual
 * reload (BUG-LIVE-2). Realtime (when the `event` table is published) does the
 * instant work; this slow poll + a window-focus refetch are the always-present
 * fallbacks. Kept slow — the key changes at most a few times per event.
 */
const ACTIVE_EVENT_POLL_MS = 60_000;

export interface ActiveEvent {
  eventKey: string | null;
  loading: boolean;
}

interface EventRow {
  event_key: string;
  is_active: boolean;
}

/**
 * Resolve the active event for staff. Reads `event.is_active` from the server but
 * seeds React Query's initialData from localStorage so a refetch / tab-focus never
 * blanks the selection mid-session (root of the "selected event disappears" bug).
 * Setting the active event happens via `setActiveEvent`.
 */
export function useActiveEvent(): ActiveEvent {
  const stored = getStoredActiveEvent();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ACTIVE_EVENT_KEY,
    initialData: stored ?? undefined,
    // Re-resolve on tab focus and on a slow interval so a switch made on another
    // device propagates to the data tabs without a manual reload (BUG-LIVE-2).
    refetchOnWindowFocus: true,
    refetchInterval: ACTIVE_EVENT_POLL_MS,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('event')
        .select('event_key,is_active')
        .eq('is_active', true);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as EventRow[];
      const next = rows[0]?.event_key ?? null;
      // Read storage FRESH here rather than closing over the render-time `stored`.
      // If the active event was just deleted, deleteEvent() has already cleared
      // localStorage; a refetch fired by invalidateQueries() must then resolve to
      // null, NOT resurrect the dead key through a stale closure. For a transient
      // empty server result, storage still holds the good value, so this fallback
      // still prevents blanking the selection mid-session.
      const persisted = getStoredActiveEvent();
      // Keep the local cache in step with the server's source of truth, but never
      // erase a known-good local value on a transient empty result.
      if (next) setStoredActiveEvent(next);
      return next ?? persisted ?? null;
    },
  });

  // Realtime: when the `event` table is in the Supabase realtime publication, a
  // flip of `is_active` on ANY device pushes here and we re-resolve immediately.
  // Harmless no-op when the table isn't published or the client lacks Realtime
  // (e.g. mocked in unit tests) — the focus/interval refetch above still covers it.
  useEffect(() => {
    if (typeof supabase.channel !== 'function') return;
    const channel = supabase
      .channel('active-event')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ACTIVE_EVENT_KEY });
        },
      )
      .subscribe();
    return () => {
      if (typeof supabase.removeChannel === 'function') supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    eventKey: query.data ?? stored ?? null,
    loading: query.isLoading && !stored,
  };
}
