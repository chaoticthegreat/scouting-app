// src/auth/__tests__/useSession.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();
const from = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      onAuthStateChange: (...a: unknown[]) => onAuthStateChange(...a),
    },
    from: (...a: unknown[]) => from(...a),
  },
}));

import { useSession } from '../useSession';

const session = { user: { id: 'auth-uid-1' } };
const scoutRow = {
  id: 's1', event_key: '2026casnv', display_name: 'Ada',
  auth_uid: 'auth-uid-1', created_at: '2026-06-23T00:00:00.000Z',
};

function mockTable(table: string) {
  if (table === 'scout') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: scoutRow, error: null }) }) }),
    };
  }
  if (table === 'profile') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { auth_uid: 'auth-uid-1', role: 'lead' }, error: null }) }) }),
    };
  }
  throw new Error('unexpected table ' + table);
}

beforeEach(() => {
  getSession.mockReset();
  onAuthStateChange.mockReset();
  unsubscribe.mockReset();
  from.mockReset();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  from.mockImplementation(mockTable);
});

describe('useSession', () => {
  it('starts loading, then resolves session/scout/role', async () => {
    getSession.mockResolvedValue({ data: { session }, error: null });

    const { result } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual(session);
    expect(result.current.scout).toEqual(scoutRow);
    expect(result.current.role).toBe('lead');
  });

  it('resolves to nulls when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.scout).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('unsubscribes the auth listener on unmount', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { unmount } = renderHook(() => useSession());
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
