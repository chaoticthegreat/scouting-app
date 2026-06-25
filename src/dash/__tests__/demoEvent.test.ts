import { describe, it, expect, beforeEach, vi } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}));

const setActiveEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../setActiveEvent', () => ({
  setActiveEvent: (...a: unknown[]) => setActiveEventMock(...a),
}));

const deleteEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../deleteEvent', () => ({
  deleteEvent: (...a: unknown[]) => deleteEventMock(...a),
}));

import {
  DEMO_EVENT_KEY,
  isDemoEvent,
  enableDemoMode,
  disableDemoMode,
} from '../demoEvent';

const qc = { invalidateQueries: vi.fn().mockResolvedValue(undefined) } as never;

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ error: null });
  setActiveEventMock.mockClear();
  deleteEventMock.mockClear();
  (qc as { invalidateQueries: ReturnType<typeof vi.fn> }).invalidateQueries.mockClear();
});

describe('demoEvent', () => {
  it('exposes the demo event key', () => {
    expect(DEMO_EVENT_KEY).toBe('2026demo');
  });

  it('isDemoEvent matches only the demo key', () => {
    expect(isDemoEvent('2026demo')).toBe(true);
    expect(isDemoEvent('2026casnv')).toBe(false);
    expect(isDemoEvent(null)).toBe(false);
  });

  it('enableDemoMode seeds, activates, then invalidates', async () => {
    await enableDemoMode(qc);
    expect(rpcMock).toHaveBeenCalledWith('seed_demo_event', { p_event_key: '2026demo' });
    expect(setActiveEventMock).toHaveBeenCalledWith('2026demo', qc);
    expect(
      (qc as { invalidateQueries: ReturnType<typeof vi.fn> }).invalidateQueries,
    ).toHaveBeenCalled();
    // Ordering: seed before activate before invalidate.
    const seedOrder = rpcMock.mock.invocationCallOrder[0];
    const activateOrder = setActiveEventMock.mock.invocationCallOrder[0];
    const invalidateOrder = (
      qc as { invalidateQueries: ReturnType<typeof vi.fn> }
    ).invalidateQueries.mock.invocationCallOrder[0];
    expect(seedOrder).toBeLessThan(activateOrder);
    expect(activateOrder).toBeLessThan(invalidateOrder);
  });

  it('enableDemoMode throws when the seed RPC errors', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'boom' } });
    await expect(enableDemoMode(qc)).rejects.toThrow(/boom/);
    expect(setActiveEventMock).not.toHaveBeenCalled();
  });

  it('disableDemoMode deletes the demo event then invalidates', async () => {
    await disableDemoMode(qc);
    expect(deleteEventMock).toHaveBeenCalledWith('2026demo', qc);
    expect(
      (qc as { invalidateQueries: ReturnType<typeof vi.fn> }).invalidateQueries,
    ).toHaveBeenCalled();
  });
});
