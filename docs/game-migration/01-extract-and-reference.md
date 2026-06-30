# Phase 0 + 1 — Extract the manual, write the Game Reference

The game manual is a 100+ page PDF written for humans. You cannot reliably reason about
scoring off raw PDF text in one pass — tables come out column-garbled, and the numbers
that matter most (point values, RP thresholds, phase timings) are exactly the ones that
corrupt. So we do this in two steps: **extract to text**, then **distill into a
structured reference doc** that becomes the single source of truth for every code change.

The 2026 artifacts to imitate:
- Extracted text: `.manual_txt/page_001.txt` … (166 files, one per page)
- Distilled reference: `docs/research/2026-rebuilt-game-reference.md` ← **read this first
  as your template.** Your job in Phase 1 is to produce the 2027 equivalent.

---

## Phase 0 — Extract the PDF to per-page text

The repo already contains `.manual_txt/` from 2026. Recreate it for the new manual so you
can grep and cite specific pages.

```bash
# Option A — if pdftotext (poppler) is available (preferred; keeps layout):
mkdir -p .manual_txt_2027
pdftotext -layout 2027GameManual.pdf - | csplit ... # or per-page below

# Per-page (most useful — lets you cite page_NNN like the 2026 reference does):
python3 - <<'PY'
import pypdf, pathlib
r = pypdf.PdfReader("2027GameManual.pdf")
out = pathlib.Path(".manual_txt_2027"); out.mkdir(exist_ok=True)
for i, pg in enumerate(r.pages, 1):
    (out / f"page_{i:03d}.txt").write_text(pg.extract_text() or "")
print("pages:", len(r.pages))
PY
```

If neither tool is installed, you can also `Read` the PDF directly (the Read tool renders
PDF pages) — do it in ≤20-page chunks. Prefer extracted text for grep-ability, but **use
the Read tool to visually re-check any scoring/timing table**, because those are the ones
that corrupt in text extraction. The 2026 reference's "Open Questions" section exists
entirely because of table-extraction garble — expect the same and verify against the
rendered page.

> Tip: vet any new dependency (`pypdf`, etc.) per the project's standing rule before
> installing. `pdftotext` via poppler is usually already present on macOS/Linux.

---

## Phase 1 — Write the Game Reference doc

Create `docs/research/<year>-<gamename>-game-reference.md`. **Mirror the section
structure of `docs/research/2026-rebuilt-game-reference.md` exactly** — downstream code
maps onto these sections, and keeping them parallel makes the diff between seasons legible.

Required sections (same as 2026):

1. **Game Summary** — one dense paragraph. The objective, the field, match length, the
   phase breakdown, and *the defining strategic mechanic*. For 2026 that mechanic was the
   active/inactive HUB. **Identify the equivalent for the new game explicitly** — it
   drives the single most invasive code decision (the "alliance-state modifier" slot).
2. **Scoring Elements** — every game piece. Diameter/shape/count matter less than: is it
   scored *continuously* (you can fire many fast — a rate) or as *discrete placements*
   (you count individual cycles)? Note this per element; it decides the rate-vs-counter
   capture model.
3. **Field Zones** — every named structure, alliance-specific or not. These become the
   field-image labels, the intake-source enum, and pit-form fields (e.g. 2026's "can fit
   through the TRENCH"). Note the **field symmetry** (rotational vs mirror — see below).
4. **Match Phases & Timing** — a timeline table. Auto duration, teleop duration, every
   sub-window with start/end seconds and which scoring state is active in each. This maps
   directly to `clock.ts` and `windows.ts`.
5. **Scoring Table** — every action → phase → location → points. This is `SCORING` in
   `src/scoring/constants.ts`. **Verify every number against the rendered PDF page**, not
   just extracted text.
6. **Ranking Points** — each bonus RP, its condition, and thresholds at the three event
   tiers (Regional/District · District Champ · FIRST Champ).
7. **Observable Robot Capabilities (Scout-Trackable)** — the bridge to the UI. What can a
   stands scout actually see and tap? This list becomes the capture buttons, the review
   wizard fields, and the pit-form capabilities.
8. **Proposed Scouting Metrics by Phase** — for AUTO / TELEOP / ENDGAME, list the
   quantitative fields (with proposed names + types) and qualitative notes. This is your
   draft of the report schema. Tie each metric back to a scoring-table row.
9. **Open Questions / Uncertainties** — everything you could not verify cleanly
   (garbled tables, ambiguous rules). Flag anything that affects a *point value*,
   *threshold*, or *phase boundary* as must-verify-before-Phase-3.

### What to be most careful about

The downstream code is only as correct as this doc. Prioritize accuracy on, in order:

1. **Point values** (Scoring Table) — wrong here ⇒ wrong everywhere (client, server,
   demo, analytics).
2. **Phase boundaries / timings** (Timeline) — wrong here ⇒ scouts attribute scoring to
   the wrong window ⇒ the active/inactive split is wrong.
3. **The defining strategic mechanic** — decides whether the `inactiveFirst`-style
   alliance-state slot exists at all for this game.
4. **RP thresholds** — wrong here only affects RP-projection displays, lower stakes.

When the manual and your extraction disagree, **the rendered PDF page wins** — re-Read it.

### Field symmetry (don't skip)

`src/dash/fieldFrame.ts` maps an auto path recorded on one alliance's side to the other
side. 2026's field has **rotational** symmetry, so the mapping is a 180° rotation
`(x,y) → (1−x, 1−y)`. Some past FRC fields are **mirror** symmetric instead (`(x,y) →
(1−x, y)`). Determine which the new field is and record it here — Phase 3 needs it.

### Output

A single markdown file under `docs/research/`. Once it exists and the point values /
timings are verified, you have everything needed to fill the Game Model Decision Sheet in
[02-game-model-slots.md](./02-game-model-slots.md).
