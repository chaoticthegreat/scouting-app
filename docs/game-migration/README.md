# Game Migration Guide — porting this app to a new FRC season

**Audience: you, a future AI coding agent (or a human), handed next year's FRC game
manual and asked to make this scouting app work for that game in as few shots as
possible.**

This app was built for the **2026 game REBUILT presented by Haas**. The 2026 build is
not "the app" — it is *one instantiation* of a game-agnostic scouting/strategy engine
with the 2026 game plugged into a fixed set of **slots**. Your job each season is to
swap what's in the slots, not to rewrite the engine.

If you do this right, the inputs are exactly three things:

1. **This documentation** (the `docs/game-migration/` folder).
2. **The new year's game manual** (a PDF dropped in the repo root, e.g. `2027GameManual.pdf`).
3. **The existing codebase** as the base framework.

…and the output is a working app for the new game.

---

## The mental model: engine vs. game-slots

Roughly 80% of this codebase is **game-agnostic** and must NOT be rewritten:

- Offline-first storage (Dexie/IndexedDB), the sync engine + outbox, QR transfer
- Login-less scouter identity, roster, assignments, event setup/import
- The prediction *framework* (confidence-weighted scouting⊕EPA blend), the EPA port,
  TBA/Statbotics/Nexus proxies, webhooks, realtime
- Routing, error boundaries, PWA shell, the dashboard's tab structure
- The wire-shape discipline (client sends raw inputs; server recomputes aggregates)

The other ~20% is **game-specific** and lives in a known, finite set of slots:

| Slot | What it encodes (2026) | Primary home |
|---|---|---|
| Match timing | 20s auto, 140s teleop | `src/capture/clock.ts` |
| Teleop phase windows | transition + 4 shifts + endgame | `src/scoring/windows.ts` |
| Alliance-state modifier | active/inactive HUB (`inactiveFirst`) | `src/scoring/windows.ts`, capture UI |
| Scoring elements | FUEL (rate model), FEED | `src/scoring/`, capture sliders |
| Endgame / climb | levels 0–3 + auto-L1 bonus | `src/scoring/constants.ts` |
| Per-robot observations | pins, capacity, intake, flags | report types + capture review |
| Fouls | manual rule tags | `src/scoring/fouls.ts` |
| Field geometry | field.png + aspect + symmetry | `src/components/FieldDiagram.tsx`, `src/dash/fieldFrame.ts` |
| Ranking points | ENERGIZED/SUPERCHARGED/TRAVERSAL | game reference doc (mostly) |
| Analytics tuning | score-magnitude thresholds | `src/dash/*` constants |
| External integration | TBA score_breakdown keys, demo event | `src/dash/localEpa.ts`, `demoEvent.ts` |

The complete, file-by-file inventory of these slots is **[03-change-catalog.md](./03-change-catalog.md)**.

---

## The one rule that breaks the app if you get it wrong

**Scoring logic is duplicated in THREE places and they must stay byte-for-byte equivalent.**

1. **Client** — `src/scoring/` (`constants.ts`, `windows.ts`, `compute.ts`)
2. **Server** — the `recompute`/aggregate block inside the `upsert_match_report` RPC
   (a new SQL migration; the logic is currently carried in the latest redefinition)
3. **Demo seeder** — `supabase/functions/seed-demo/index.ts` (frozen copies of the
   same constants)

The server is the source of truth for stored aggregates (it recomputes from the raw
inputs the client uploads). If client and server disagree, scouts see one number and
the dashboard shows another. This is covered in detail in
**[04-scoring-sync-contract.md](./04-scoring-sync-contract.md)** — read it before
touching any scoring math.

---

## The workflow (phases)

Do these in order. Each phase has its own doc.

- **Phase 0 — Extract.** Convert the new manual PDF to text. → [01-extract-and-reference.md](./01-extract-and-reference.md)
- **Phase 1 — Reference.** Produce `docs/research/<year>-<game>-game-reference.md`, the
  structured intermediate that everything downstream reads. → [01-extract-and-reference.md](./01-extract-and-reference.md)
- **Phase 2 — Decide.** Fill out the **Game Model Decision Sheet**: choose what goes in
  each slot (rate vs counter scoring? is there an alliance-state modifier? how many
  endgame tiers?). → [02-game-model-slots.md](./02-game-model-slots.md)
- **Phase 3 — Implement.** Bottom-up: scoring core → report types/db → capture UI →
  server migration + recompute → seed-demo → dashboard analytics/labels → field assets →
  fouls. → [03-change-catalog.md](./03-change-catalog.md) + [04-scoring-sync-contract.md](./04-scoring-sync-contract.md)
- **Phase 4 — Verify & deploy.** Typecheck, unit (golden logic) tests, e2e, demo mode,
  then `supabase db push` / `functions deploy`. → [05-verify-and-deploy.md](./05-verify-and-deploy.md)

---

## Suggested kickoff prompt (for a fresh agent session)

> Read `docs/game-migration/README.md` and the rest of `docs/game-migration/`. The new
> game manual is `<YEAR>GameManual.pdf` in the repo root. Execute Phase 0 → Phase 4:
> extract the manual, write the game-reference doc, fill the Game Model Decision Sheet
> and confirm it with me, then implement the slot changes from the change catalog
> keeping the client/server/demo scoring triplet in sync, and finish with the
> verification checklist. Pause for my review after the Decision Sheet and before
> `supabase db push`.

---

## Why pause points matter

Two decisions are worth a human check before you write code:

1. **The Game Model Decision Sheet** (Phase 2). Getting "is scoring rate-based or
   count-based?" or "is there an alliance-state modifier?" wrong means redoing the
   capture UI and the scoring triplet. Cheap to confirm, expensive to undo.
2. **Before `supabase db push`** (Phase 4). Migrations are append-only and hit a live
   remote project; a wrong column type or a recompute that disagrees with the client is
   a data-integrity problem, not just a bug. See the deploy doc.

Everything else you can run autonomously.
