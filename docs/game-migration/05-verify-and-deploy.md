# Phase 4 — Verify & deploy

Run these in order. Fix forward; don't skip the type/test gates — a season migration
touches the schema, and a silent client/server desync is the expensive failure mode.

## 1. Typecheck (fast, catches the ripple)

```bash
npm run typecheck
```

Changing the `MatchWindow` union, the `climbLevel` literal type, or a renamed report
field surfaces here as errors across capture, dash, and sync. Clear all of them before
moving on — TS is doing the "did I find every touchpoint?" work for you.

## 2. Unit / integration tests (the golden scoring logic)

```bash
npm test
```

Key suites for a migration:
- `src/scoring/__tests__/` — golden scoring logic. These assert **invariants** (round
  once per window, active/inactive split, points exclude inactive), not magnitudes. Update
  expected *numbers* to the new game; if you find yourself changing the *shape* of an
  assertion, make sure that's intentional.
- `src/db/__tests__/localStore.test.ts` — Dexie shape/upgrade.
- `src/export/__tests__/exportReports.test.ts` — CSV column set.
- `src/components/__tests__/FieldDiagram.test.tsx`, `src/dash/__tests__/fieldFrame.test.ts`
  — field geometry/symmetry.

Run one suite while iterating: `npx vitest run src/scoring/compute.test.ts`.

## 3. End-to-end (hits the REAL remote Supabase — validates the server triplet)

```bash
npm run test:e2e
```

This is where a **client/server scoring desync** gets caught, because the e2e flow
submits a report through the real `upsert_match_report` RPC and reads the stored
aggregates back. Notes:
- Single-worker by design (`workers: 1`) — the specs share one DB and mutate the global
  `event.is_active` singleton. Don't parallelize.
- Requires the new migration + functions to be **deployed** first (step 5) if your changes
  touch the server. If e2e fails on a scoring mismatch, compare `compute.ts` against the
  new RPC body — see [04-scoring-sync-contract.md](./04-scoring-sync-contract.md).

## 4. Manual smoke via demo mode

Bring up the app (`npm run dev`) and toggle **Setup → Demo mode**. Because demo data is
seeded server-side against the new scoring model, this exercises the whole stack with
real team numbers:
- Capture a match → review aggregates look right → submit → it appears in My Data.
- Dashboard Next Match shows a prediction; Team/Ranking/Picklist populate.
- The field image renders with the correct aspect ratio; start-position and auto-path
  capture land where you tap; red↔blue auto paths mirror correctly.
- Report Detail shows the new labels (no leftover "fuel"/"corral" if you renamed).

If demo numbers look self-inconsistent but a hand-captured real report looks fine, the
drift is in `seed-demo`, not the core.

## 5. Deploy the backend (standing auto-deploy instruction)

Migrations are **append-only and numbered**; the next is `0039_…` (after the current
`0038_` head — re-check `supabase/migrations/` for the real head before naming). **Never
edit a pushed migration** — add a new one.

```bash
supabase db push            # apply new migration(s)
supabase functions deploy   # deploy seed-demo and any changed functions
```

The Supabase CLI has cached creds in this environment. The Supabase MCP is read-only —
deploy via the CLI. After pushing, record the new migration number(s) and what they do in
the project memory dir (the repo tracks which migration numbers are deployed).

The frontend deploys via **Vercel on merge to `main`** — no manual step; just land the PR.

## 6. Final grep sweep (did anything leak through?)

```bash
grep -rinE 'fuel|climb|tower|\bhub\b|depot|corral|trench|\bbump\b|shift|inactive|REBUILT|2026|pins|fed_?corral' \
  src supabase --include=*.ts --include=*.tsx --include=*.sql | grep -vi test
```

Every remaining hit should be either (a) an intentionally-kept internal name (if you chose
"keep `fuel*` as the generic primary-element name"), or (b) a genuine leftover to fix.
There should be **zero** stray `REBUILT` / `2026` / `corral` / `trench` references in
user-facing strings.

## Done-criteria checklist

- [ ] `npm run typecheck` clean
- [ ] `npm test` green (scoring goldens updated to new magnitudes, invariants intact)
- [ ] New server migration mirrors `compute.ts` exactly (scoring triplet in sync)
- [ ] `seed-demo` constants mirror `src/scoring/`
- [ ] `npm run test:e2e` green against deployed backend
- [ ] Demo mode smoke passes end-to-end with correct labels + field geometry
- [ ] `supabase db push` + `functions deploy` done; migration number recorded in memory
- [ ] Grep sweep shows no stray prior-season references in UI strings
- [ ] README/CLAUDE.md game framing updated
