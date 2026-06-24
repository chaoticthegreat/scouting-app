import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  getStoredBaseTeam,
  setStoredBaseTeam,
  DEFAULT_BASE_TEAM,
} from '@/dash/baseTeamStore';

// The jsdom-compat env ships a non-functional localStorage; install a minimal
// in-memory polyfill so the real store logic is exercised.
beforeAll(() => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

beforeEach(() => {
  localStorage.clear();
});

describe('baseTeamStore', () => {
  it('defaults to DEFAULT_BASE_TEAM (3256) when unset', () => {
    expect(DEFAULT_BASE_TEAM).toBe(3256);
    expect(getStoredBaseTeam()).toBe(3256);
  });

  it('round-trips a valid team number', () => {
    setStoredBaseTeam(254);
    expect(getStoredBaseTeam()).toBe(254);
  });

  it('reset (null) returns to the default', () => {
    setStoredBaseTeam(254);
    setStoredBaseTeam(null);
    expect(getStoredBaseTeam()).toBe(DEFAULT_BASE_TEAM);
  });

  it('ignores non-positive / non-integer values (falls back to default)', () => {
    setStoredBaseTeam(0);
    expect(getStoredBaseTeam()).toBe(DEFAULT_BASE_TEAM);
    setStoredBaseTeam(-5);
    expect(getStoredBaseTeam()).toBe(DEFAULT_BASE_TEAM);
  });

  it('treats a corrupt stored value as the default', () => {
    localStorage.setItem('base_team_number', 'not-a-number');
    expect(getStoredBaseTeam()).toBe(DEFAULT_BASE_TEAM);
  });
});
