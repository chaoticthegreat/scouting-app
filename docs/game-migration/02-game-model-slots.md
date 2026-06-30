# Phase 2 — Game Model Decision Sheet

Before writing code, decide what goes in each game-slot. These decisions determine *how
much* of the app changes. Getting them right up front is the difference between a
one-shot migration and a thrash. **Fill this out from the Game Reference doc, then
confirm the high-impact ones with the human before Phase 3.**

Each slot below states: the abstraction, what 2026 chose, the decision you must make, and
the blast radius if it changes.

---

## Slot 1 — Match timing

**Abstraction:** total auto and teleop durations.

- **2026:** `AUTO_MS = 20_000`, `TELEOP_MS = 140_000` (`src/capture/clock.ts`).
- **Decide:** the new auto/teleop lengths in ms.
- **Blast radius:** small and mechanical — two constants, plus the teleop window bounds
  (Slot 2) which must sum to `TELEOP_MS`.

---

## Slot 2 — Teleop phase windows

**Abstraction:** teleop is divided into named sub-windows, each with `[start,end)` ms and
an "is this window always-active?" property. The `MatchWindow` union type enumerates them.

- **2026:** `transition` (0–10s), `shift1`..`shift4` (25s each), `endgame` (last 30s).
  auto/transition/endgame are always active; shifts alternate (Slot 3).
- **Decide:**
  - How many sub-windows, their names, and bounds (must tile `[0, TELEOP_MS)`).
  - Which are unconditionally active vs. governed by an alliance-state modifier.
  - **If the new game has no time-sliced scoring states at all** (most FRC games don't),
    collapse this to something simple like `teleop` + `endgame`. That is a *simplifying*
    change — see Slot 3.
- **Blast radius:** medium-to-large. The `MatchWindow` type ripples through
  `types.ts`, `compute.ts`, `windows.ts`, the capture clock, the server recompute, and
  `fuelByShift`-style per-window arrays. Renaming/changing window count touches the whole
  scoring triplet.

---

## Slot 3 — Alliance-state modifier (the big one)

**Abstraction:** a per-match boolean (`inactiveFirst`) plus logic (`isInactive`,
`isWindowActive`) that flips whether scoring in a given window *counts*. 2026's
active/inactive HUB is the most unusual mechanic this app has ever modeled.

- **2026:** `inactiveFirst: boolean` captured pre-match; `isInactive(shiftN, inactiveFirst)`
  decides which shifts score 0. Drives `teleopFuelActive` vs `teleopFuelInactive`.
- **Decide — pick ONE:**
  - **(A) The new game has an equivalent modifier** (some windows conditionally score).
    Keep the structure; re-derive the boolean's meaning and the `isInactive` formula.
  - **(B) The new game has NO such modifier** (the common case). Then **delete the
    machinery**: drop `inactiveFirst` / `inactiveFirstSource` from the report types and
    DB, remove the "Was your HUB inactive first?" pre-match prompt, collapse
    `isWindowActive` to always-true, and fold `teleopFuelActive`/`teleopFuelInactive`
    into a single `teleopX` aggregate. This is a deletion, not an addition — strictly
    simpler.
- **Blast radius:** large either way, because it touches capture UI, report schema,
  scoring triplet, dashboard labels, reconciliation, and demo seeding. **This is the #1
  decision to confirm with the human.** If unsure whether the game has a modifier, ask.

---

## Slot 4 — Scoring elements: rate model vs. counter model

**Abstraction:** how the scout records scoring events during the live match.

- **2026:** FUEL is high-volume and continuous, so the scout uses **hold-and-slide rate
  sliders** that emit `FuelBurst { startMs, endMs, rate, window }`. The server integrates
  rate×time per window and rounds half-up once per window. A second element, FEED (balls
  to the human player), uses the same burst model (`feedingBursts`).
- **Decide:**
  - Is the primary game piece **high-volume/continuous** (balls, fuel) → keep the rate
    burst model? Or **discrete/low-count** (notes, cones, cubes — a handful of cycles per
    match) → switch to **per-window integer counters** (increment buttons)?
  - How many distinct scored elements / locations are there (2026 had one scored element
    — FUEL — plus a non-scoring FEED action)? Multi-location games (high/low goal,
    speaker/amp, different node levels) need either multiple counters or an element+location
    tag on each scoring event.
  - Is there a secondary "deliver to human player / feeder" action like FEED?
- **Blast radius:** large for the capture UI (`src/capture/`) and the scoring triplet. If
  you switch rate→counter, the `FuelBurst` type, `computeAggregates`, the server's
  `jsonb_array_elements(... fuel_bursts ...)` integration loop, and the seed-demo burst
  generator all change shape. **Confirm rate-vs-counter with the human** — it's the #2
  decision.

> **Naming:** "fuel" appears in dozens of identifiers (`autoFuel`, `fuelByShift`,
> `fuel_points`, `meanFuelPoints`, `feedingBursts`, `droppedFuel`, …). Decide early
> whether to **rename to the new element** (cleaner, larger diff) or **keep `fuel*` as the
> internal name for "primary scored element"** and only change user-facing labels (smaller
> diff, mild semantic drift). The change catalog assumes you may do either; pick one and
> be consistent. Keeping internal names is the faster one-shot path.

---

## Slot 5 — Endgame / climb

**Abstraction:** a tiered endgame with point values per tier, optionally a separate
auto-period variant, plus attempted/success booleans.

- **2026:** `climbLevel: 0|1|2|3`, `SCORING.CLIMB[level] = { auto, teleop }`, an auto-only
  Level-1 bonus (`autoClimbLevel1`), and `climbAttempted`/`climbSuccess`. Note the server
  stores `climb_level` raw but does **not** compute climb points — climb points are a
  client/dashboard-side calc.
- **Decide:**
  - Number of tiers and their point values (could be 0/1/2 for park/hang, a charge-station
    balance, a trap, etc.).
  - Is there an auto-period endgame action (the auto-climb-bonus analog)?
  - Are "attempted" and "success" both meaningful, or just a single state?
- **Blast radius:** medium. `climbLevel` is a `0|1|2|3` literal union in several types —
  changing the tier count edits those unions plus `CLIMB_LEVELS`/`CLIMB_LABEL` arrays and
  the pit `capabilities` enum (`climb_l1/l2/l3`).

---

## Slot 6 — Per-robot observations

**Abstraction:** the scalar/boolean fields a scout records beyond scoring & endgame.

- **2026:** `intakeSources` (`neutral`/`depot`/`human_feed`), `maxFuelCapacityObserved`,
  `pins`, `defenseRating` + defense/defended interval timers, mobility
  (`autoLeftStartingLine`), reliability flags (`noShow`/`died`/`tipped`), and
  game-specific flags (`droppedFuel`, `fedCorral`).
- **Decide, for each:** keep as-is (most reliability/defense fields are game-agnostic),
  rename (intake sources → new field zones from the Reference §3), or drop (`fedCorral`,
  `droppedFuel`, `pins`, `trenchCapable` are 2026-specific — replace with the new game's
  equivalents or remove).
- **Blast radius:** small-to-medium and additive. Each field is independent: report type +
  DB column + capture-review control + dashboard label. Defense analytics (intervals,
  suppression metrics) are game-agnostic — keep them.

---

## Slot 7 — Fouls

**Abstraction:** `FOUL_REASONS[]` — advisory tags keyed to manual rule numbers. The
numeric `foulsMinor`/`foulsMajor` counts are game-agnostic and stay.

- **2026:** six tags (`opponent_contact`/G415, `pinning`/G418, …) in `src/scoring/fouls.ts`.
- **Decide:** the new game's most-called fouls (Game Rules §G in the manual) and their
  rule codes. Keep stable `key`s short and never reuse an old key for a new meaning.
- **Blast radius:** tiny — one array. Labels are the contract, not the codes.

---

## Slot 8 — Field geometry & assets

**Abstraction:** a top-down field image + its aspect ratio + the red↔blue symmetry
transform. Robot start position and auto path are captured as normalized `[0,1]²` coords
over this image.

- **2026:** `public/assets/field/field.png` (3902×1584 px), aspect ratio hardcoded as
  `3902 / 1584` (and its rotated transpose) in `src/components/FieldDiagram.tsx`,
  rotational symmetry in `src/dash/fieldFrame.ts`.
- **Decide:** obtain the new field render (FIRST publishes one; the 2026 file
  `FE-2026-..._Playing_Field...png` in the repo root is an example of the source art).
  Get its pixel dimensions and its symmetry type (Slot from Reference §3).
- **Blast radius:** small. Replace the PNG, update the two `aspectRatio` strings to the
  new `W / H` (and `H / W`), and set the symmetry transform in `fieldFrame.ts` (`rotate180`
  vs a mirror). Start-position/auto-path capture logic is reusable unchanged.

---

## Slot 9 — Ranking points & win-probability calibration

**Abstraction:** bonus-RP thresholds, and the score-magnitude constants that calibrate the
win-probability curve.

- **2026:** RP thresholds live mostly in the Game Reference doc (ENERGIZED 100/240/360,
  etc.); the dashboard's win-prob uses `WINPROB_SIGMA_FRACTION`/`_FLOOR`/`_LOGIT_SCALE`
  in `src/dash/constants.ts`, self-calibrating to total score.
- **Decide:** new RP thresholds; whether the typical alliance score magnitude shifts
  enough to retune `WINPROB_SIGMA_FRACTION` (it's a fraction of total score, so it
  self-adjusts somewhat — only retune if calibration looks off after real data).
- **Blast radius:** small. These are display/tuning constants, no schema impact.

---

## Slot 10 — Analytics tuning thresholds

**Abstraction:** dozens of magnitude-dependent thresholds in `src/dash/` that classify
teams (strong scorer, reliable climber, heavy feeder, strong defender) and flag
multi-scout conflicts.

- **2026:** e.g. `FUEL_STRONG=30`, `CLIMB_L23_POINTS=18`, `HEAVY_FEED_FUEL=25`,
  `LOW_FUEL_PTS=30`, `FUEL_SEVERE_PTS=8`, `TYPICAL_OPP_TELEOP_FUEL=40` across
  `allianceSimulator.ts`, `aggregate.ts`, `reconcile.ts`, `constants.ts`.
- **Decide:** these are *display heuristics*, not scoring — safe to ship with rough
  values and retune after the first real event. Scale them by the ratio of new-game to
  2026 typical scores as a first guess.
- **Blast radius:** none structural. Tune freely; golden tests assert logic, not these.

---

## Slot 11 — External integration

**Abstraction:** TBA/Statbotics hooks and demo-mode seeding.

- **2026:** `staged_fuel_per_match` default (504) in schema/import/seed; TBA
  `score_breakdown` key guesses in `src/dash/localEpa.ts` (flag-gated off behind
  `ENABLE_TBA_BREAKDOWN`); demo event keys `2026demo` / source `2026casnv` in
  `src/dash/demoEvent.ts` and `seed-demo`.
- **Decide:** new staged-element count (if the schema keeps that column); the real
  `score_breakdown` JSON keys (only knowable once the new season's events post results —
  leave the flag off until then); a real early-season event key for demo mode.
- **Blast radius:** small. The EPA scalar port itself is game-agnostic and needs no change.

---

## Decision Sheet template (fill and confirm)

```
GAME: <year> <name>
1. Match timing:        auto = ___ s, teleop = ___ s
2. Teleop windows:      [list names + bounds, or "teleop+endgame only"]
3. Alliance-state mod:  (A) keep, meaning = ___  |  (B) none — delete machinery
4. Scoring model:       rate-burst | per-window counter  ;  #elements = ___ ; secondary "feed" action? Y/N
5. Endgame tiers:       [tier:points ...] ; auto-endgame action? Y/N ; attempted+success? Y/N
6. Observations keep/rename/drop:  intake=___ ; drop: [fedCorral? pins? droppedFuel? trenchCapable?]
7. Fouls:               [key:label:rule ...]
8. Field:               image dims = ___×___ ; symmetry = rotational | mirror
9. RP thresholds:       [rp:threshold-tiers ...]
10. Analytics retune:   scale factor ≈ new/2026 typical score = ___
11. Integration:        staged count=___ ; demo source event=___ ; score_breakdown keys: leave OFF
RENAMING CHOICE:        rename fuel*→<element>*  |  keep fuel* internal, relabel UI only
```

Confirm **#3 (alliance-state modifier)** and **#4 (rate vs counter)** with the human
before Phase 3. Everything else you can proceed on.
