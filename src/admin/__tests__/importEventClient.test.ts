import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock('@/lib/env', () => ({ env: { SUPABASE_URL: 'https://x.supabase.co' } }));

import { importEvent } from '../importEventClient';

describe('importEvent', () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.unstubAllGlobals();
  });

  it('posts to the import-event function with a bearer token and returns the summary', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    const summary = { event_key: '2026casnv', name: 'CA SV', team_count: 37, match_count: 80, join_code: 'ABCD1234' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => summary });
    vi.stubGlobal('fetch', fetchMock);

    const result = await importEvent('2026casnv');

    expect(result).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.supabase.co/functions/v1/import-event',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok-123',
        }),
        body: JSON.stringify({ event_key: '2026casnv' }),
      })
    );
  });

  it('throws when there is no session token', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal('fetch', vi.fn());
    await expect(importEvent('2026casnv')).rejects.toThrow(/not signed in/i);
  });

  it('throws on a non-200 response', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) }));
    await expect(importEvent('2026casnv')).rejects.toThrow(/forbidden|403/);
  });
});
