/**
 * React Query cache persistence for offline-first PWA usage.
 *
 * The lead dashboard is entirely React-Query-driven. Without persistence, an
 * offline page reload drops the in-memory cache and every query restarts from
 * scratch — which, while offline, leaves the UI stuck on infinite "Loading…"
 * spinners. To fix that we:
 *
 *   1. Persist the React Query cache to IndexedDB (via idb-keyval) so a reload
 *      can rehydrate the last successful results.
 *   2. Use `networkMode: 'offlineFirst'` so queries serve cached data
 *      immediately and still attempt a network fetch, rather than getting
 *      stuck in a permanently paused/pending state when offline.
 *
 * Correctness invariant: `gcTime` MUST be >= the persister `maxAge`, otherwise
 * React Query garbage-collects cache entries before they can be restored from
 * IndexedDB. Both are pinned to 14 days here.
 *
 * The idb-keyval store name ('frc-react-query') is deliberately distinct from
 * the app's Dexie databases ('scouting-db' / 'pit-scouting-db') so the caches
 * never collide.
 *
 * Map/Set round-tripping: the persister serializes with JSON, which turns a
 * `Map` into `{}` and a `Set` into `{}` — silently dropping their contents and,
 * worse, their prototype. Query data that holds a Map (e.g. `useEventEpa`'s
 * `epaByTeam`) would then rehydrate as a plain object after a reload, and the
 * first `.get()` call throws "epaByTeam.get is not a function". The custom
 * serialize/deserialize below tag Maps and Sets so they survive the round-trip.
 */
import { QueryClient } from '@tanstack/react-query';
import {
  createAsyncStoragePersister,
} from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { createStore, get, set, del } from 'idb-keyval';

// 14 days. Used for both gcTime and the persister maxAge (see invariant above).
const MAX_AGE: number = 1000 * 60 * 60 * 24 * 14;

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // MUST exceed persister maxAge or persisted entries get GC'd before restore.
      gcTime: MAX_AGE,
      // Return cached data and still attempt fetch; do not infinitely suspend when offline.
      networkMode: 'offlineFirst',
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Dedicated idb-keyval store so it doesn't collide with the app's Dexie DBs.
const idbStore = createStore('frc-react-query', 'cache');

// JSON replacer/reviver that preserve Map and Set through the persisted cache.
// JSON.stringify otherwise collapses both to `{}`, losing contents + prototype.
const MAP_TAG = '__rq_map__';
const SET_TAG = '__rq_set__';

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { [MAP_TAG]: true, value: Array.from(value.entries()) };
  }
  if (value instanceof Set) {
    return { [SET_TAG]: true, value: Array.from(value.values()) };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v[MAP_TAG] === true && Array.isArray(v.value)) {
      return new Map(v.value as Iterable<[unknown, unknown]>);
    }
    if (v[SET_TAG] === true && Array.isArray(v.value)) {
      return new Set(v.value as Iterable<unknown>);
    }
  }
  return value;
}

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key: string): Promise<string | null> =>
      get<string>(key, idbStore).then((value) => value ?? null),
    setItem: (key: string, value: string): Promise<void> =>
      set(key, value, idbStore),
    removeItem: (key: string): Promise<void> => del(key, idbStore),
  },
  key: 'frc-rq-cache',
  throttleTime: 1000,
  serialize: (client) => JSON.stringify(client, replacer),
  deserialize: (cached) => JSON.parse(cached, reviver),
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: MAX_AGE,
  // Only persist successful queries so we never restore error/pending states.
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success',
  },
};
