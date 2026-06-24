import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  NEXUS_DEMO_EVENT_KEY,
  getStoredNexusEventKey,
  setStoredNexusEventKey,
} from '../nexusEventStore';

// The jsdom-compat test environment ships a non-functional localStorage (its
// methods are undefined), so install a tiny in-memory Storage polyfill to
// exercise the real store logic deterministically.
beforeAll(() => {
  const store = new Map<string, string>();
  const mem = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true });
});

beforeEach(() => {
  localStorage.clear();
});

describe('nexusEventStore', () => {
  it('returns null when unset', () => {
    expect(getStoredNexusEventKey()).toBeNull();
  });

  it('round-trips a set value', () => {
    setStoredNexusEventKey('2026demo');
    expect(getStoredNexusEventKey()).toBe('2026demo');
    expect(localStorage.getItem(NEXUS_DEMO_EVENT_KEY)).toBe('2026demo');
  });

  it('trims surrounding whitespace on set', () => {
    setStoredNexusEventKey('  2026demo  ');
    expect(getStoredNexusEventKey()).toBe('2026demo');
  });

  it('trims surrounding whitespace on get', () => {
    localStorage.setItem(NEXUS_DEMO_EVENT_KEY, '  2026demo  ');
    expect(getStoredNexusEventKey()).toBe('2026demo');
  });

  it('clears the key when passed null', () => {
    setStoredNexusEventKey('2026demo');
    setStoredNexusEventKey(null);
    expect(getStoredNexusEventKey()).toBeNull();
    expect(localStorage.getItem(NEXUS_DEMO_EVENT_KEY)).toBeNull();
  });

  it('clears the key when passed an empty string', () => {
    setStoredNexusEventKey('2026demo');
    setStoredNexusEventKey('');
    expect(getStoredNexusEventKey()).toBeNull();
  });

  it('clears the key when passed whitespace only', () => {
    setStoredNexusEventKey('2026demo');
    setStoredNexusEventKey('   ');
    expect(getStoredNexusEventKey()).toBeNull();
  });
});
