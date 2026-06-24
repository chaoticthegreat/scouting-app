import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { ensureEventScoutsFromRoster } from '../ensureEventScoutsClient';

describe('ensureEventScoutsFromRoster', () => {
  beforeEach(() => rpc.mockReset());

  it('calls the seed RPC and maps rows to AssignScout[]', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'a', display_name: 'Cara' },
        { id: 'b', display_name: 'Dev' },
      ],
      error: null,
    });
    const out = await ensureEventScoutsFromRoster('2026caetb');
    expect(rpc).toHaveBeenCalledWith('seed_event_scouts_from_roster', { p_event_key: '2026caetb' });
    expect(out).toEqual([
      { id: 'a', displayName: 'Cara' },
      { id: 'b', displayName: 'Dev' },
    ]);
  });

  it('returns [] when the RPC yields no rows', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(ensureEventScoutsFromRoster('2026caetb')).resolves.toEqual([]);
  });

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(ensureEventScoutsFromRoster('2026caetb')).rejects.toThrow(/boom/);
  });
});
