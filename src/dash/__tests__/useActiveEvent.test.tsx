import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACTIVE_EVENT_KEY } from '../useActiveEvent';

let eventRows: { event_key: string; is_active: boolean }[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: eventRows, error: null }),
      }),
    }),
  },
}));

// The jsdom-compat test environment has a non-functional localStorage, so we mock
// the store module directly to control the "stored" value deterministically.
let stored: string | null = null;
vi.mock('../activeEventStore', () => ({
  getStoredActiveEvent: () => stored,
  setStoredActiveEvent: (v: string | null) => {
    stored = v;
  },
}));

import { useActiveEvent } from '../useActiveEvent';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  eventRows = [];
  stored = null;
});

describe('useActiveEvent', () => {
  it('seeds eventKey from the stored value immediately (no null flash)', () => {
    stored = '2026casnv';
    const { result } = renderHook(() => useActiveEvent(), { wrapper });
    expect(result.current.eventKey).toBe('2026casnv');
    expect(result.current.loading).toBe(false);
  });

  it('keeps the stored value even if the server returns an empty result', async () => {
    stored = '2026casnv';
    eventRows = []; // transient empty fetch
    const { result } = renderHook(() => useActiveEvent(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eventKey).toBe('2026casnv');
  });

  it('resolves from the server when nothing is stored', async () => {
    eventRows = [{ event_key: '2026orwil', is_active: true }];
    const { result } = renderHook(() => useActiveEvent(), { wrapper });
    await waitFor(() => expect(result.current.eventKey).toBe('2026orwil'));
  });

  // Regression: deleting the ACTIVE event clears storage, then SetupTab's
  // handleDelete fires queryClient.invalidateQueries(). The ensuing refetch must
  // NOT resurrect the just-deleted key — the queryFn has to read storage fresh,
  // not from a stale render-time closure. (See useActiveEvent.ts; the bug was
  // `return next ?? stored ?? null` capturing the old `stored`.)
  it('does not resurrect a stored value that was cleared, then refetched', async () => {
    stored = '2026casnv';
    eventRows = [{ event_key: '2026casnv', is_active: true }];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useActiveEvent(), { wrapper: wrap });
    await waitFor(() => expect(result.current.eventKey).toBe('2026casnv'));

    // Simulate the delete: storage cleared, server no longer has an active row.
    stored = null;
    eventRows = [];
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ACTIVE_EVENT_KEY });
    });

    await waitFor(() => expect(result.current.eventKey).toBeNull());
  });
});
