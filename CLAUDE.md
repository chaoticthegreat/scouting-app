# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline-first PWA for FRC team 3256 scouting the 2026 game **REBUILT**. One app, two
roles (no login wall): **Scout** captures match/pit data from the stands; **Lead Dashboard**
turns it into live, broadcast-style strategy. The whole point is surviving a bad venue
network — local-first storage, persisted caches, and QR device-to-device transfer.

## Commands

```bash
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # tsc -b && vite build
npm test             # Vitest (unit + DB + function tests); test:watch for watch mode
npm run test:e2e     # Playwright e2e (boots dev server on :5173 automatically)
npm run typecheck    # tsc --noEmit -p tsconfig.json
```

Run a single test: `npx vitest run src/scoring/compute.test.ts` or `-t "<name>"`.
Single e2e: `npx playwright test tests/e2e/capture.spec.ts`.

Vitest `include` covers `src/**/*.{test,spec}` plus `tests/db/**` and `tests/functions/**`;
e2e under `tests/e2e/**` is excluded from Vitest and run only by Playwright. The jsdom
environment is a custom compat shim (`vitest-env-jsdom-compat.ts`), and `@` aliases `src/`.

**Playwright e2e hits a real remote Supabase**, so it runs single-worker (`workers: 1`):
the live specs share one DB and mutate the global `event.is_active` singleton — parallel
files would stomp each other.

## Deployment

The Supabase backend is **already deployed to a remote project** (not local). After changing
anything under `supabase/`, push it — there is a standing instruction to auto-deploy:

```bash
supabase db push                 # apply new migrations
supabase functions deploy        # deploy edge functions
```

Frontend deploys via Vercel on merge to `main`. Migrations are append-only and numbered
(`0001_`…); never edit a pushed migration — add a new one. The memory dir tracks which
migration numbers are deployed.

## Environment

`VITE_*` vars ship to the browser and are safe (RLS protects them). Anything without the
`VITE_` prefix is server-only (`SUPABASE_SECRET_KEY` bypasses RLS — Edge Functions and
migrations only; `TBA_API_KEY` is used by the `tba-proxy` function). See `.env.example`.

## Architecture

**Frontend** — React 18 + TS + Vite, Tailwind, React Router. State via Zustand (small
stores like `activeEventStore`, `baseTeamStore`) + TanStack Query. `App.tsx` wraps everything
in `PersistQueryClientProvider` so the query cache persists to IndexedDB (`idb-keyval`) and an
offline reload rehydrates the last good data instead of hanging.

**No auth, no role gates** (`src/routes/router.tsx`). Every route is open; a silent anonymous
Supabase session (`src/auth/ensureAnonSession.ts`, called from `main.tsx`) satisfies RLS.
Every route carries the same `errorElement` (`RouteError`) so a single screen throwing can
never blank the whole app — critical because offline fetch failures otherwise read as a dead page.

**Local-first storage** — `src/db/localStore.ts` is a Dexie (IndexedDB) DB (`scouting-db`).
Reports and drafts persist immediately with a `syncState` (`dirty`/`pending`/`synced`/error).
A separate v2 "preload cache" (cachedMatches/Assignments/Roster/Teams) pre-downloads event
data so scout screens work with zero wifi.

**Sync engine** (`src/sync/`) — `outbox.ts` drains the dirty queue through the
revision-guarded, idempotent `upsert_match_report` RPC (re-uploading the same id+revision is a
server no-op, so re-running is safe). `useSync.ts` runs it on mount, on the offline→online
edge, every `SYNC_POLL_MS`, and on demand. `classifyError.ts` splits failures into
**transient** (retry with backoff) vs **terminal** (dead-letter); `SYNC_MAX_ATTEMPTS` converts
a stuck transient into a dead-letter. `mapReport.ts` is the *single* source of the snake_case
upsert wire shape — the server recomputes aggregates from raw fields, so keep client and RPC in sync.

**QR transfer** (`src/qr/`) — when there's no network at all, reports move device-to-device by
animated QR (fountain-coded; see `sync/constants.ts` `FOUNTAIN_BLOCK_BYTES`/`QR_FRAME_MS`) and
merge on the receiving side.

**Scoring model** (`src/scoring/`) — pure, versioned (`SCHEMA_VERSION`) REBUILT scoring.
`computeAggregates` turns raw inputs (fuel bursts over time windows, climbs, defense intervals,
auto routines) into aggregates. `migrations.ts`/`migrateUp` upgrades old report shapes. This is
duplicated server-side (the RPC recomputes) — the client computation is for display/preview.

**Dashboard prediction** (`src/dash/`) — `predict.ts` is a pure confidence-weighted next-match
prediction: blends our scouting expectation with EPA, weighted by how many matches we've
scouted, degrading to scouting-only or EPA-only when a source is missing. `localEpa.ts` /
`seasonEpa.ts` compute a cross-event (season carry-over) scalar EPA locally over TBA results
when Statbotics is unavailable — `localEpa.ts` mirrors the live Statbotics repo math (not the
2023 blog) and is fed by TBA matches since the local table has no scores. `demoEvent.ts` drives
demo mode.

**Backend** (`supabase/`) — Postgres with RLS. Edge Functions are thin proxies that **degrade
gracefully**: each returns an `{ available: false }` unavailability sentinel rather than
throwing, so a TBA/Statbotics/Nexus outage never takes the dashboard down (`src/dash/proxies.ts`
reads the sentinel). Functions: `tba-proxy`, `statbotics-proxy`, `nexus-proxy` (live field
status), `import-event`, `ingest-reports`, `seed-demo` (builds a demo event from a real TBA
event using a service-role client). Key RPCs: `upsert_match_report`, `select_scouter`,
`seed_event_scouts_from_roster`, `delete_event`, `delete_scout`.

## Conventions

- Design contracts referenced throughout the sync/dash code (`phase3-contracts.md §N`) live in
  `docs/design/`. When changing the sync wire shape or prediction math, check the referenced
  section.
- Scouter identity is fragile — `select_scouter` has had several migrations consolidating
  duplicate seeded scout rows and re-pointing reports before deletion. Touch it carefully.
