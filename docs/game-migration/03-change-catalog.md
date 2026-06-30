# Phase 3 — Change Catalog (the exhaustive slot inventory)

Every game-specific touchpoint in the codebase, grouped by layer, in **implementation
order** (bottom-up: change the scoring core first, let the types ripple, then UI, then
server, then dashboard). For each entry: the file, the symbol(s) to change, and what the
new game requires.

Line numbers drift — **anchor on symbol names**, and re-grep before editing. The fastest
way to confirm you've found everything: after your edits, grep the game vocabulary and
review every remaining hit:

```bash
grep -rinE 'fuel|climb|tower|\bhub\b|depot|corral|trench|\bbump\b|shift|inactive|REBUILT|pins|fed_?corral' \
  src supabase --include=*.ts --include=*.tsx --include=*.sql | grep -vi test
```

> **Keep the scoring triplet in sync** as you go (client ⇄ server ⇄ seed-demo). That
> contract has its own doc: [04-scoring-sync-contract.md](./04-scoring-sync-contract.md).
> Items below marked **[TRIPLET]** must be mirrored in all three places.

---

## Layer 1 — Scoring core (`src/scoring/`) — do this first

| File | Symbol | Change |
|---|---|---|
| `constants.ts` | `SCORING` | **[TRIPLET]** Replace `FUEL_POINTS` and the `CLIMB` table with the new game's point values (Reference §5). Bump `SCHEMA_VERSION` if the report shape changes (triggers `migrations.ts`). |
| `windows.ts` | `SHIFT_BOUNDS` | **[TRIPLET]** New teleop sub-window names + `[start,end)` ms (Slot 2). Must tile `[0, TELEOP_MS)`. |
| `windows.ts` | `isInactive`, `isWindowActive`, `shiftNumberOf` | **[TRIPLET]** Re-derive (Slot 3). If no alliance-state modifier, make `isWindowActive` always-true and delete `isInactive`. |
| `types.ts` | `MatchWindow` | The union of window names — keep in lockstep with `SHIFT_BOUNDS`. |
| `types.ts` | `FuelBurst`, `MatchReportInputs`, `MatchReportAggregates` | Element capture shape (rate vs counter — Slot 4), `climbLevel` tier union (Slot 5), `inactiveFirst` presence (Slot 3), the per-window aggregate array (`fuelByShift`). |
| `compute.ts` | `computeAggregates` | **[TRIPLET]** The integration + rounding + active/inactive split. This is the canonical client scoring fn; the server SQL mirrors it exactly. |
| `fouls.ts` | `FOUL_REASONS` | New foul tags + rule codes (Slot 7). |
| `migrations.ts` | `migrations` map | If you bump `SCHEMA_VERSION` and want old local drafts to upgrade, add a `migrations[n]` step. New season usually starts clean, so often just the version bump. |
| `index.ts` | exports | Re-export anything you add/rename. |

Golden tests in `src/scoring/__tests__/` assert *logic* (rounding once-per-window, active
split), not magnitudes — update expected values, keep the invariants.

---

## Layer 2 — Report types & local DB (`src/db/`)

| File | Symbol | Change |
|---|---|---|
| `db/types.ts` | `LocalMatchReport` | The local (Dexie) report shape. Game fields: `inactiveFirst(+Source)`, `fuelBursts`, `feedingBursts`, `autoFuel`, `teleopFuelActive/Inactive`, `endgameFuel`, `fuelByShift`, `fuelPoints`, `fuelEstimateConfidence`, `climbLevel/Attempted/Success`, `autoClimbLevel1`, `intakeSources`, `maxFuelCapacityObserved`, `defenseRating`, `pins`, `droppedFuel`, `fedCorral`. Add/rename/drop per the Decision Sheet. |
| `db/localStore.ts` | Dexie schema/defaults | If you add fields with non-null defaults or change indexes, bump the Dexie version and provide an upgrade. Check `__tests__/localStore.test.ts`. |

---

## Layer 3 — Scout capture UI (`src/capture/`, `src/scout/`)

| File | Symbol / region | Change |
|---|---|---|
| `capture/clock.ts` | `AUTO_MS`, `TELEOP_MS`, teleop window order array | Slot 1 + 2 timings. |
| `capture/CaptureScreen.tsx` | FUEL slider, FEED slider, running tallies | Slot 4 — relabel/recolor; swap rate sliders for counters if counter model. Strings: "FUEL · hold + slide", "FEEDING", "BPS", "fuel scored", "fed". |
| `capture/CaptureScreen.tsx` | defense / getting-defended timers | Game-agnostic mechanic — keep; relabel only if needed. |
| `capture/CaptureScreen.tsx` | "Auto Climb" toggle, "Left Line" toggle, foul button, endgame cue | Slot 5 (auto-endgame), mobility, fouls. |
| `capture/CaptureScreen.tsx` | "Was your HUB inactive first?" pre-match prompt | **Slot 3** — delete entirely if no alliance-state modifier; reword if kept. |
| `capture/useCaptureSession.ts` | session state | Mirrors the report fields being captured — update alongside the report type. |
| `capture/ReviewScreen.tsx` | wizard steps | `CLIMB_LEVELS`, `INTAKE` enum, defense/pins/max-capacity inputs, status flags ("Dropped", "No show", "Died", "Tipped"), aggregate labels ("Auto fuel", "Teleop active/inactive", "Endgame fuel", "By shift", "Fuel points"), auto-path editor (field-image only — reusable). |
| `scout/MyDataView.tsx` | `CLIMB_LABEL` array, aggregate display | Slot 5 labels + element labels. |

---

## Layer 4 — Pit scouting (`src/pit/`)

| File | Symbol | Change |
|---|---|---|
| `pit/PitScoutScreen.tsx` | mechanisms list | "Common REBUILT mechanisms" (`intake/shooter/elevator/arm/climber/hopper/indexer/turret`) — update to the new game's common mechanisms. |
| `pit/PitScoutScreen.tsx` | capabilities enum | `auto/climb_l1/climb_l2/climb_l3/defense` — track Slot 5 tier count. |
| `pit/PitScoutScreen.tsx` | intake sources enum | Match capture's intake enum (Slot 6). |
| `pit/PitScoutScreen.tsx` | match-strategy enum | `score/feed/defend/cycle/support` — mostly generic; adjust "feed" if no feeder. |
| `pit/PitScoutScreen.tsx` | "Can fit through the trench" | 2026-specific dimension question — replace with the new field's clearance constraint, or drop. |
| `pit/PitScoutScreen.tsx` | vision/batteries/dimensions/preferred-auto | Generic — keep. Preferred-auto uses the field diagram (reusable). |
| `pit/pitStore.ts` | `PitReport` type | `trenchCapable`, `capabilities` tiers, `intakeSources` — mirror the form. |

---

## Layer 5 — Server (`supabase/`) — append a new migration, never edit a pushed one

> Migrations are **append-only and numbered**. The next number after the current head
> (`0038_*`) is `0039_`. See [05-verify-and-deploy.md](./05-verify-and-deploy.md).

| Concern | Where (2026) | Change |
|---|---|---|
| Game columns on `match_scouting_report` | base `0001_schema.sql`; later adds in `0008/0009/0010/0024` | In a **new** migration: `alter table … add/drop column` for every report field you changed in Layer 2. Mirror the wire shape exactly. |
| Server scoring recompute | inside the `upsert_match_report` RPC body (latest redefinition carries the live logic; helpers `msr_is_inactive` / `msr_round_half_up` from `0002`/`0009`) | **[TRIPLET]** In a new migration, `create or replace function … upsert_match_report` with the recompute block updated to match `compute.ts` (window names, bounds via `jsonb_array_elements`, active/inactive split, `* FUEL_POINTS`). **Copy the latest existing definition and edit only the scoring block** — it also contains scouter-identity logic you must not lose. |
| `staged_fuel_per_match` | `0001_schema.sql` default `504` | New staged count, or drop the column if the new game has no analog. |
| Pit columns | `0023_pit_extra_fields.sql`; upsert in `0031` | New migration for pit field changes (e.g. drop `trench`-related). |
| `foul_reasons` column | `0024_match_foul_reasons.sql` (text[]) | No schema change needed — it stores arbitrary keys; just the client `FOUL_REASONS` list changes. |

The scouter-identity / sync / event RPCs (`select_scouter`, `delete_event`,
`set_active_event`, webhooks, etc.) are **game-agnostic — do not touch**.

---

## Layer 6 — Demo seeding (`supabase/functions/seed-demo/`)

| Symbol | Change |
|---|---|
| `CLIMB_TELEOP_POINTS` | **[TRIPLET]** Mirror `SCORING.CLIMB` teleop values. |
| `SHIFT_BOUNDS` | **[TRIPLET]** Mirror `windows.ts`. |
| `staged_fuel_per_match: 504` | Mirror schema. |
| burst generator (the `window:` assignments), climb roll, `fuel_points` calc | **[TRIPLET]** Regenerate synthetic reports against the new scoring model so demo data is internally consistent. |
| demo event keys | also set in `src/dash/demoEvent.ts` — see Layer 8. |

Other edge functions (`import-event`, `tba-proxy`, `statbotics-proxy`, `nexus-proxy`,
`ingest-reports`, `*-webhook`, `sync-event-results`) are game-agnostic.

---

## Layer 7 — Sync wire shape (`src/sync/`)

| File | Symbol | Change |
|---|---|---|
| `sync/mapReport.ts` | the snake_case object | **The single source of truth for the upsert payload.** Add/rename/drop every raw field you changed. Rule: **send raw inputs only, never computed aggregates** — the server recomputes them. Keep this in lockstep with the new server migration's column list. |
| `sync/constants.ts` | QR/fountain constants | Game-agnostic — no change. |

---

## Layer 8 — Dashboard analytics & display (`src/dash/`)

Structural (must change with schema):

| File | Symbol | Change |
|---|---|---|
| `dash/types.ts` | `MsrRow` | Mirror of the `match_scouting_report` columns — keep in lockstep with the server migration. |
| `dash/aggregate.ts` | `TeamAgg` + `climbPointsForMatch` + `aggregateTeamComponentSplit` | The per-team rollups (`meanAutoFuel`, `meanFuelPoints`, `meanClimbPoints`, `avgClimbLevel`, defense metrics). Rename fields with the element; `climbPointsForMatch` reads `SCORING.CLIMB`. |
| `dash/predict.ts` | `ComponentBreakdown` (auto/fuel/climb/defense) | The prediction blends these components. If your component decomposition changes (e.g. no separate "fuel"), adjust. The *blend math* (confidence weighting, EPA fallback, win-prob) is game-agnostic — keep. |

Labels (cosmetic, but user-facing — sweep all of them):

| File | What |
|---|---|
| `dash/ReportDetail.tsx` | "Auto fuel/Teleop active/inactive/Endgame fuel/Fuel points", "Climb level/Attempted/Success", "Pins", "Dropped fuel", "Fed corral". |
| `dash/RankingView.tsx` | column labels ("Exp. Pts", "Climb %", "Def ↓", …). |
| `dash/TeamCompare.tsx` | `COMPARE_AXES` (radar axes: fuel/auto/climb/defense), `DEFENSE_MAX`. |
| `dash/AllianceSimulatorView.tsx` | role rows ("Auto/Fuel/Defense/Climb L1/Climb L2-3"). |
| `dash/CombinedAutoField.tsx`, `dash/charts/*` | chart titles/units referencing the element. |

Tuning constants (Slot 9/10 — safe to rough-in, retune after real data):

| File | Constants |
|---|---|
| `dash/constants.ts` | `WINPROB_*`, `TYPICAL_OPP_TELEOP_FUEL`, `DEFENSE_RATING_MAX_PTS`, `CONFIDENCE_N`, `EPA_RECENCY_BOOST`. |
| `dash/allianceSimulator.ts` | `FUEL_STRONG/PARTIAL`, `CLIMB_L23_POINTS`, `DEFENSE_STRONG/PARTIAL`, `AUTO_FUEL_STRONG`, … |
| `dash/aggregate.ts` | guidance heuristics `RELIABLE_CLIMB_RATE`, `HIGH_CLIMB_LEVEL`, `HEAVY_FEED_FUEL`, `LOW_FUEL_PTS`, `STRONG_DEFENSE`, … |
| `dash/reconcile.ts` | `FUEL_MINOR_PTS`, `FUEL_SEVERE_PTS`, `DEFENSE_SEVERE`. |

Integration:

| File | Symbol | Change |
|---|---|---|
| `dash/localEpa.ts` | `AUTO_FUEL_KEYS`/`TELEOP_FUEL_KEYS`/`CLIMB_KEYS`, `ENABLE_TBA_BREAKDOWN` | TBA `score_breakdown` field names — unknowable until the new season posts results; **leave the flag off** until verified against a real match. The scalar EPA port itself is game-agnostic. |
| `dash/demoEvent.ts` | `DEMO_EVENT_KEY`, `DEMO_SOURCE_EVENT_KEY` | New demo event id + a real early-season source event for the new year. |

---

## Layer 9 — Field assets (`public/`, `src/components/`)

| File | Symbol | Change |
|---|---|---|
| `public/assets/field/field.png` | the image | Replace with the new season's top-down field render. |
| `components/FieldDiagram.tsx` | the two `aspectRatio` strings (`'3902 / 1584'` and `'1584 / 3902'`) | Set to the new image's `W / H` and `H / W`. The `<img src>`, normalized-coord capture, heatmap, and path overlay are all reusable unchanged. |
| `dash/fieldFrame.ts` | `rotate180` / `pointToFrame` | Slot 8 symmetry. Keep `rotate180` for rotational fields; swap to a mirror `(x,y)→(1−x,y)` if the new field is mirror-symmetric. Check `__tests__/fieldFrame.test.ts`. |

---

## Layer 10 — Export & misc

| File | Symbol | Change |
|---|---|---|
| `export/exportReports.ts` | report→CSV/row mapping | References `fuelBursts`/`fuelByShift` etc. — update column set to the new fields. Check `__tests__/exportReports.test.ts`. |
| `README.md`, `CLAUDE.md`, `docs/` | prose | Update the "what this is" framing, screenshots, and any game-named architecture notes. Low priority but keeps the repo honest. |

---

## What you must NOT change (game-agnostic core)

`src/sync/outbox.ts` + classify/backoff, `src/qr/*`, `src/auth/*`, `src/roster/*`,
`src/admin/*` (event import/setup/assignments/coverage), `src/lib/*`, `src/pwa/*`,
`src/routes/*`, the Dexie sync-state machine, and all scouter-identity/event SQL RPCs.
The prediction *framework* and EPA scalar port in `src/dash/` (predict blend, `localEpa`
recurrence, `seasonEpa`) are game-agnostic — only their *inputs and labels* change.
