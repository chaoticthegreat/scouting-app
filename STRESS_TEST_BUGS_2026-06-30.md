# Full Event Simulation — Bug Report (2026-06-30)

**Method:** A live Playwright walkthrough of the real app against the deployed Supabase
(`oztsfxyfovwnwutrxzmo`) — driving the **Scout** flow end-to-end (name pick → manual pick →
placement → auto → teleop → endgame → 5-step review → save → My Data → Sync), then the
**Lead Dashboard** through all 8 tabs (Next Match, Team, Scouters, Match, Ranking, Picklist,
Alliance, Setup), QR + Pit screens — combined with **4 parallel adversarially-verified static
audits** (sync/data-loss, scoring/capture, dashboard/prediction, QR/admin/concurrency). Every
finding below was verified in code and/or reproduced live; false positives were discarded.

Baseline: `tsc` clean, dev server healthy, no uncaught page errors during the tour.

Mid-test the active event was switched (`2026txhou1` → `2026casnv`) from another device — this
surfaced real event-switch behavior (see BUG-LIVE-2), and is **not** the cause of the data-loss
bug (BUG-1).

Severity: **P0** = crash / data loss / blocks core flow · **P1** = feature broken / wrong data ·
**P2** = wrong data or stuck state in an edge case · **P3** = nit/UX.

---

## P0 — Data loss / unrecoverable

### BUG-1 — Manual pick stores the raw match number as `match_key` → permanent dead-letter (DATA LOSS)  ★ reproduced live
- **Where:** `src/capture/ScoutHome.tsx:433-443` (`startManual`)
- **What:** The Manual-pick form's match field feeds `matchKey` verbatim. Typing `10` stores
  `matchKey: "10"` instead of the canonical `2026txhou1_qm10`. On sync, the
  `match_scouting_report.match_key → match(match_key)` FK rejects it
  (`violates foreign key constraint "match_scouting_report_match_key_fkey"`, 23503 → 409).
- **Proof:** Captured match 10 as "Test 1"/team 254 → SAVE → `⚠1` dead-letter. Postgres logs show
  the FK violation; the IndexedDB `reports` row has `matchKey:"10"`, `syncState:"error"`.
  `match_key='2026txhou1_qm10'` exists in `match`; `"10"` does not.
- **Sibling:** `target_team_number → team(team_number)` FK — manually picking a team not in the
  event roster dead-letters identically. Empty active event → `event_key` FK/RLS failure, same.
- **Fix:** Normalize the manual match key to `<eventKey>_qm<n>` (accept `10`, `qm10`, or full key);
  validate the team is in the event roster before allowing Start. The assignment path
  (`a.match_key`) is already correct — only manual pick is broken.

### BUG-2 — Dead-lettered reports are excluded from QR transfer (cannot be rescued offline)
- **Where:** `src/qr/QrSendScreen.tsx:39` → `getSyncQueue()` in `src/db/localStore.ts:132-138`
- **What:** QR-send builds its batch from `getSyncQueue()`, which includes only
  `dirty`/`pending` and **excludes `error`**. The reports most in need of device-to-device
  rescue (dead-lettered) are the exact ones QR skips. Export-to-file (`getUnsynced()`) is the
  only path that includes them.

### BUG-3 — "Retry all failed" re-runs the identical broken payload → infinite re-dead-letter
- **Where:** `src/sync/SyncStatusScreen.tsx:66-79` → `requeueReport` (`localStore.ts:170-176`)
- **What:** Requeue only resets `syncState='dirty'`/attempts/error — it cannot change the bad
  `match_key`/`team`/`event_key`. A terminal FK failure (BUG-1) re-fails immediately, forever.
  Combined with BUG-2 and BUG-4 there is **no in-app recovery** for a terminally-failed report.

---

## P1 — Broken feature / wrong data

### BUG-4 — A dead-lettered report cannot be edited to fix its data
- **Where:** `src/scout/MyDataView.tsx:156-163` (hides Edit when `syncState==='error'`) and
  `src/capture/ScoutHome.tsx:330` (edit effect bails `if (!r || r.syncState==='error') return`)
- **What:** The only UI affordance for an `error` report is a "needs sync fix" link to /sync.
  There is no way to correct the bad match/team that caused the terminal failure → only escape
  is JSON export. This is the missing escape hatch that turns BUG-1 from annoying into
  catastrophic.

---

## P2 — Wrong data / stuck state (edge cases)

### BUG-LIVE-2 — Dashboard data tabs show STALE event after the active event is switched elsewhere  ★ observed live
- **Where:** dashboard data tabs (`useEventData`/persisted query cache + `useActiveEvent`) vs
  `SetupTab`
- **What:** After the active event flipped `2026txhou1` → `2026casnv` on another device, this
  browser's dashboard kept rendering 2026txhou1 data on Next Match/Team/Match/Ranking/Picklist/
  Alliance (header read `2026txhou1`), while the **Setup tab showed the true `2026casnv`** — an
  inconsistent event-key within one session, persisting until a manual reload. A lead could read
  the wrong event's rankings without noticing.

### BUG-5 — Review number inputs accept negative / absurd values (no clamp)  ★ reproduced live
- **Where:** `src/capture/ReviewScreen.tsx:311` (Pins), `:321` (Max capacity), `:345` (Fouls
  minor), `:355` (Fouls major) — raw `Number(e.target.value)`, no `Math.max(0, …)`
- **What:** Entered `Pins:-5` and `Max capacity:99999`; both persisted verbatim into the stored
  report (verified in IndexedDB) and would cast straight into the server columns, corrupting
  pin/foul/capacity displays (`ReportDetail.tsx:188`, `TeamView.tsx:1086`) and any average over
  them. The two adjacent seconds inputs (`:286`, `:300`) **are** clamped — proving the omission.

### BUG-6 — `classifyError` auto-requeue regex matches every Postgres `23503`, not just orphaned-scout
- **Where:** `src/sync/classifyError.ts:143` — `/\b23503\b|invalid scout_id|no such scout/i`
- **What:** Postgres uses `23503` for **all** FK violations. `requeueAuthClassDeadLetters()`
  (`localStore.ts:151-167`, run once/session by `useSync.ts:138`) treats a genuinely-terminal
  FK dead-letter (bad match/team, BUG-1) as "recoverable" and silently re-queues it, muddying the
  "permanently stuck" signal (bounded to once/session → churn, not an infinite loop).

### BUG-7 — QR receive drops the ENTIRE batch (403) when the receiving device has no scout row
- **Where:** `supabase/functions/ingest-reports/index.ts:60-71` + open `/qr/receive` route
  (`src/routes/router.tsx:66`, no scouter-selected guard)
- **What:** `ingest-reports` requires `get_my_event_keys()` non-empty (= caller has a `scout`
  row). A device that opens Receive-via-QR without ever picking a name returns 403 and rejects the
  whole decoded backlog — the data-loss QR exists to prevent. Guard the route / provision a scout
  row on the service-role path.

### BUG-8 — Double-elim replay set number mislabeled
- **Where:** `src/dash/NextMatchView.tsx:163-175` (`shortMatchLabel`) + `src/lib/formatMatch.ts:103`
- **What:** `formatMatchKeyRaw("..._sf3m2")` → `"Semi 3-2"`; `shortMatchLabel` matches trailing
  digits → renders `"SF2"` (the game number) instead of `SF3` (the set). Only bites the
  schedule-fallback path for replayed sets; live Nexus labels are correct.

---

## P3 — Nits / cosmetic / cleanup

- **BUG-9** Coverage-count mismatch: heartbeat shows `0/5` with aria-label `0/6 stations`; Match
  view shows `0/6 stations` but `5 not reported`. Stations (6) vs scout count (5) conflated.
  (`ScoutHeartbeat`, `MatchView` coverage.)
- **BUG-10** Placement step is skippable — "Submit / Start match" has no guard on
  `autoStartPosition` (`CaptureScreen.tsx:441-452`); saves `null`. If the scout also draws no
  path, the report is dropped from the dashboard auto-heatmap and the known-auto reuse picker
  (`useTeamAutoHistory.ts:78`).
- **BUG-11** Picklist accepts a non-event team number (entered `99999`) with no name and no
  validation (`PicklistView` add).
- **BUG-12** "Red favored" label shown at a perfect 50/50 prediction (`NextMatchView` win-prob).
- **BUG-13** All-zero in-house EPA renders every strength bar empty (`maxEpa` stays 0) —
  `PicklistEpaBoard.tsx:96-100,146-149`.
- **BUG-14** Leaderboard "Total" is reconstructed as `round(rp * gamesPlayed)` not TBA's real
  total RP — can disagree (`Leaderboard.tsx:71-72`).
- **BUG-15** `setActiveEvent` is non-atomic (two sequential UPDATEs, no txn) — a concurrent
  `useActiveEvent` read in the gap can observe **zero** active events; localStorage usually
  self-heals (`src/dash/setActiveEvent.ts:15-19`; same pattern `import-event/index.ts:123-142`).
- **BUG-16** `delete_event` orphans `matchup_note_history` and `nexus_event_status` (no FK,
  not deleted) → re-importing the same key resurfaces stale field-status snapshots
  (`0017_delete_event.sql:21-34`).
- **BUG-17** QR sender name-tag reverse-scan only resolves the device's own `scout_id`; foreign
  reports get no name → ingest provisions a generic "Imported scout"
  (`QrSendScreen.tsx:39-43`, `0032_upsert_resolve_caller_scout.sql:79-89`).

### Uncertain / latent — NOW FIXED (2026-06-30)
- ✅ `agg.recentFuelDelta.toFixed(1)` now guarded with `Number.isFinite` like the sibling
  formatters (`TeamView.tsx` recentFormText, `RankingView.tsx` trendLabel).
- ✅ `MatchupNotesModal` now freezes the pairing (ourTeams/oppTeams/oppLead + seed note) at the
  open transition, so a live match-data refresh mid-edit can't redirect Save to a different
  pairing or discard the in-progress note (`MatchupNotesModal.tsx`).
- ✅ `PlayoffPath` finals series tally now only counts games with a definite `winner`; a
  played-but-tied final (winner null) counts toward neither side instead of being mis-counted as
  an opponent win (`PlayoffPath.tsx`).

### Verified NOT bugs (cleared)
- XSS via scout/matchup notes — **no `dangerouslySetInnerHTML` anywhere in `src/`**; all text is
  React-escaped (notes with `<script>` render as literal text — confirmed live in My Data).
- HUB inactive/active scoring math — symmetric, unit-tested, mirrored server-side; my all-inactive
  observation was a testing artifact of one very long synthetic hold, not a scoring bug.
- Proxy `{available:false}` sentinel handling, empty-alliance prediction NaN guards, zero-scouted
  team empty-states, fountain decoder CRC/length edges, AssignmentBoard station indexing,
  webhook malformed-payload handling, idempotent revision-guarded upsert — all verified correct.
</content>
</invoke>
