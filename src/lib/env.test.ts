import { describe, it, expect } from 'vitest';
import { readEnv } from './env';

describe('readEnv', () => {
  it('returns typed values when both vars are present', () => {
    const result = readEnv({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'pk_test_123',
    } as unknown as ImportMetaEnv);
    expect(result).toEqual({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'pk_test_123',
    });
  });

  it('throws when VITE_SUPABASE_URL is missing', () => {
    expect(() =>
      readEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'pk_test_123' } as unknown as ImportMetaEnv),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it('throws when VITE_SUPABASE_PUBLISHABLE_KEY is missing', () => {
    expect(() =>
      readEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co' } as unknown as ImportMetaEnv),
    ).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
  });
});
