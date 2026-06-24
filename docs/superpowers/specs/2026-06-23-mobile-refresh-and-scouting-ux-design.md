# FRC Scouting App — Mobile Refresh & Scouting UX Overhaul

Date: 2026-06-23
Status: Approved (proceed straight to implementation; no spec-review gate per user)

## Goal

Make the app mobile-first and ergonomic with a cohesive visual language, fix
match-capture interaction bugs, fold pit scouting into the main flow, and give
the admin dashboard low-scroll navigation with full per-report drill-down.

## Approved decisions

- **Shoot control:** keep the BPS×hold-duration (rate-integral) model, max **30
  BPS** (intentionally high — possible). Redesign to a large **horizontal**
  slider that uses landscape width: drag sideways = set BPS, hold = fire,
  release = commit burst. The fix is *control*, not the math.
- **Orientation:** match-capture & review are landscape-optimized but still work
  in portrait. No hard rotation lock. Everything else fully responsive.
- **Pit scouting:** fold into the main scouting area via a `Match / Pit`
  segmented toggle on Scout Home (same identity/event/roster). `/pit` route
  retained as a redirect. Admin sees a team's pit report inside TeamView.
- **Visual scope:** full visual refresh — a shared design language applied
  across the app.

## Design language — "Field-Control Console"

Dark-first, high-contrast, energetic. Built on semantic CSS tokens so the
refresh stays consistent.

- **Palette (new tokens, added to `index.css` + `tailwind.config.js`):**
  - `brand` (electric cyan/blue) — primary actions, active nav.
  - `energy` (orange) — shooter / fuel.
  - `success` (emerald) — climb / good. `warning` (amber) — low-confidence /
    caution. `destructive` (red) — fouls / danger (existing).
  - Keep existing semantic tokens (`background`, `card`, `muted`, …); default
    the app to dark.
- **Type:** larger floors — no `text-xs` for data; tabular-nums for all stats.
- **Shape/spacing:** `rounded-2xl` cards, generous padding, ≥56px touch targets,
  lucide icon + label pairing everywhere.

## Shared foundation (Phase 1 — lands first, everything imports it)

New/edited files owned by the foundation so Phase 2 agents stay file-disjoint:

- `src/index.css`, `tailwind.config.js` — add brand/energy/success/warning
  tokens + colors. Non-breaking (additive).
- `src/components/ui/button.tsx` — add `xl` size; keep existing variants/sizes
  (button.test.tsx must stay green).
- `src/components/ui/StatTile.tsx` — label + value + optional icon/sub stat tile.
- `src/components/ui/SegmentedToggle.tsx` — accessible 2–N option segmented
  control (Match/Pit, tab-like switches).
- `src/components/ui/Sheet.tsx` — overlay drawer/bottom-sheet for drill-downs
  (no new dependency; focus-trapped, Esc/backdrop close).
- `src/components/ui/IconTabs.tsx` — icon+label tab bar that fits without
  horizontal scroll (wraps to a compact grid on narrow screens).
- `src/components/ui/PageScaffold.tsx` — sticky header + body wrapper.
- `src/lib/formatMatch.ts` — `formatMatchKey(compLevel, matchNumber)` and
  `formatMatchKeyRaw(matchKey)` → "Qual 1", "Quals 12", "Semi 3", "Final 1".
  Single source of truth for human-readable match labels. Unit-tested.
- `src/dash/useTeamPit.ts` — React Query hook returning a team's pit report
  (`pit_scouting_report` by `event_key` + `team_number`; `capabilities` jsonb is
  `{ items, intakeSources }`). Graceful null when absent.

## Phase 2 workstreams (parallel, file-disjoint)

### WS1 — Capture (live)
Files: `src/capture/SliderShoot.tsx`, `src/capture/CaptureScreen.tsx`, capture
tests for those. (Does NOT touch ScoutHome or ReviewScreen.)
- Horizontal slider-shoot: drag sideways = BPS, hold = fire, release = commit.
  Big thumb, live `BPS` + running `FUEL` readout, clear committed-vs-in-progress
  distinction so the count never feels like it "runs away." Keep
  `rateFromPointer` math testable (now X-based); keep max 30.
- Defense / Getting-Defended → whole-button **hold-slide-lock**: press+hold =
  active/timing; slide right past a threshold = locks (visual locked track);
  tap when locked = deactivate + commit. Remove the tiny separate lock target.
- Landscape-optimized layout; still usable in portrait.

### WS2 — Review
Files: `src/capture/ReviewScreen.tsx` + its test.
- **Remove the duplicate auto start-position pick** (already captured pre-match;
  Review re-asks it). Keep auto *path* editing if present.
- Apply refresh + landscape grid; bigger inputs/buttons.

### WS3 — Dashboard
Files: `src/dash/*` (DashboardScreen, MatchView, TeamView, ScouterView,
RankingView, NextMatchView, RosterTab, SetupTab) + dash tests. Consumes
`useTeamPit`, `formatMatchKey`, and shared primitives.
- Low-scroll nav via `IconTabs`; drill-downs in `Sheet` not long stacks.
- **Friendly match labels** everywhere via `formatMatchKey` (no `2026casnv_qm1`).
- **Full report drill-down**: tapping a report (ScouterView + MatchView) opens a
  complete readable report — every captured field incl. auto start/path diagram,
  fuel breakdown, climb, defense, fouls, flags, notes. New `ReportDetail`
  component under `src/dash/`.
- **Pit panel in TeamView** using `useTeamPit`.
- Bigger text/targets, lucide icons, `StatTile`s, clear labels (no cryptic text).

### WS4 — Pit + Scout Home
Files: `src/pit/*`, `src/capture/ScoutHome.tsx`, `src/routes/router.tsx`.
- Scout Home `Match / Pit` segmented toggle; Pit becomes a first-class card with
  same identity/event/roster. `/pit` → redirect to `/scout?mode=pit`.
- Refresh PitScoutScreen with shared primitives; ensure saved pit rows carry
  `event_key` + `team_number` so `useTeamPit` resolves.

## Execution

1. Build + verify foundation (typecheck + foundation unit tests), then dispatch.
2. Four agents run in parallel in the **same working tree** (existing uncommitted
   WIP must be preserved), each scoped to its files, each keeping its tests green,
   none committing.
3. Integrate: full `npm test` + `typecheck` + `build`, fix cross-cutting issues,
   commit.

## Testing

TDD per workstream. Existing suites must stay green (460 tests baseline). New
behavior (formatMatchKey, slider X-mapping, defense lock state machine, pit hook,
report drill-down) gets unit/component tests.
