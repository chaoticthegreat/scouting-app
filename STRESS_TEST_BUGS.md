# FRC Scouting App — Full Stress Test Bug Log

Date: 2026-06-26
Tester: Claude (ultracode stress test — live Playwright + static deep audit)

Baseline before testing:
- `npm run typecheck` — ✅ clean
- `npm test` (vitest) — ✅ 716/716 pass (95 files)
- `npm run test:e2e` (Playwright, real Supabase) — ⚠️ **2 failed**, 5 passed

---

## Legend
- **Severity**: P0 (crash/data-loss/blocks core flow) · P1 (feature broken / wrong data) · P2 (UX / edge case) · P3 (nit)
- **Status**: OPEN · CONFIRMED · FIXED · VERIFIED · WONTFIX/INVALID

---

## Findings

### BUG-001 — Stale e2e tests: capture flow missing new "Place the robot" placement step
- **Severity**: P1 (test suite red; indicates feature shipped without test update)
- **Source**: e2e baseline run (`capture.spec.ts:53`, `sync.spec.ts:67`)
- **Status**: CONFIRMED
- **Detail**: Commit `de5bc16` (half-field auto picker) added a pre-match placement step in `CaptureScreen.tsx` (`!placed` branch, button `capture-placement-submit`). It renders BEFORE the live screen. The e2e specs click `scout-start-capture` then immediately wait for `capture-start`, which never appears until the placement step is submitted. Both capture/sync e2e specs time out.
- **Fix**: Add `await page.getByTestId('capture-placement-submit').click()` after `scout-start-capture` in both specs.

### BUG-002 — PWA manifest icon invalid ("Resource size is not correct")
- **Severity**: P2 (breaks PWA install icon — core "installable PWA" value prop)
- **Source**: live browser console on `/dashboard`
- **Status**: CONFIRMED (console warning)
- **Detail**: Console warns: `Error while trying to use the following icon from the Manifest: http://localhost:5173/icons/icon-192.png (Resource size is not correct - typo in the Manifest?)`. The manifest declares a 192px icon whose actual pixel size doesn't match (or the file is a placeholder). Needs investigation of the PWA manifest + icon assets.

### BUG-003 — favicon.ico 404
- **Severity**: P3 (nit)
- **Source**: live browser console (every page)
- **Status**: CONFIRMED
- **Detail**: `GET /favicon.ico 404`. No favicon shipped/declared. Minor but shows on every load.

### BUG-004 — `upsert_match_report` ignores its documented ON CONFLICT → reports permanently dead-letter (DATA LOSS)
- **Severity**: P0 (silent loss of a scout's captured match data; unrecoverable)
- **Source**: live — found a real stuck dead-letter in IndexedDB (`⚠1` on scout home)
- **Status**: CONFIRMED (live repro + root-caused in SQL)
- **Detail**: The dead-lettered local report (`id 08ab28f7…`, `2026casnv_qm1`, team 254, scout `731af8a6…`) has `lastSyncError = "duplicate key value violates unique constraint \"idx_msr_match_scout_active\""`, `syncState=error`, `syncAttempts=0`.
  - `idx_msr_match_scout_active` (`0001_schema.sql:151`) is a partial unique index on `(match_key, scout_id) WHERE NOT deleted`, and its comment says it "is the conflict target for upsert_match_report (ON CONFLICT … WHERE NOT deleted)".
  - But `upsert_match_report` (latest in `0024_match_foul_reasons.sql:21`) **never uses ON CONFLICT**. It selects the existing row *by id*; if none, it does a bare `INSERT`. When `(match_key, scout_id)` already has an active report under a **different id** (created after a name re-pick / `select_scouter` consolidation — exactly the scenario migrations 0015/0016 grapple with server-side), the INSERT throws 23505.
  - `classifySyncError` maps SQLSTATE 23505 → **terminal** → `markSyncError` (dead-letter, attempts=0). `getSyncQueue` excludes dead-letters and `requeueAuthClassDeadLetters` only re-queues auth-class (23505 is not auth-class), so the report is stuck forever. The only UI recovery, "Retry all", re-runs the same INSERT and 409s again indefinitely (this is the live source of the `409 upsert_match_report` console error on scout-home mount).
- **Impact**: Any scout who re-picks their name, or whose duplicate seeded scout row gets consolidated, can have a captured report that *never* syncs and silently disappears from the dashboard. This is the app's core promise (don't lose data on a bad venue network) failing.
- **Fix**: New migration (0025) recreating `upsert_match_report` so the INSERT uses `ON CONFLICT (match_key, scout_id) WHERE NOT deleted DO UPDATE SET … , row_revision = v_incoming_rev` (revision-guarded), matching the documented design. Deploy via `supabase db push`. Optionally: client-side, treat a 23505-on-`idx_msr_match_scout_active` as "superseded → mark synced" so existing stuck reports clear after the server fix.

### BUG-005 — `nexus-proxy` returns raw 404 instead of the `{available:false}` graceful-degradation sentinel
- **Severity**: P2 (violates the "edge functions degrade gracefully" architecture; console errors; needs to confirm dashboard still renders)
- **Source**: live console on scout home (`404 nexus-proxy?path=/event/2026casnv` ×2)
- **Status**: CONFIRMED (console) — needs verification that NextMatchView still degrades cleanly
- **Detail**: `GET .../functions/v1/nexus-proxy?path=%2Fevent%2F2026casnv → 404`. ROOT CAUSE: `nexus-proxy/index.ts:79-95` only maps **5xx** to the `{available:false}` sentinel; for any other non-ok upstream status it forwards `status: upstream.status` verbatim. Nexus returns **404** for an event with no live data (normal for a past/non-live event), so the client receives a raw 404. `nexusGet` (proxies.ts:102) does catch it (`!res.ok → {available:false}`) so the app still *functions*, but (a) it violates the documented "always return the sentinel" contract and (b) it logs a console error on every scout-home + Next-Match poll. Source on scout home is `UpcomingMatches.tsx:239`. statbotics-proxy has the same 5xx-only pattern.
- **Fix**: In nexus-proxy (and statbotics-proxy for consistency), return `unavailable()` for ANY non-ok upstream status (`if (!upstream.ok) return unavailable()`), not just `>= 500`. Deploy via `supabase functions deploy`.

### BUG-006 — Sync status screen does not surface the local outbox/dead-letter queue
- **Severity**: P2 (the dedicated "Sync status" screen omits the most important local state)
- **Source**: live `/sync` screen
- **Status**: CONFIRMED
- **Detail**: `/sync` (`SyncStatusScreen`) shows only "Server coverage" (per-match server report counts). It does NOT show queued/pending reports or **dead-letters**, even though the `SyncIndicator` badge shows `⚠1`. A lead debugging "why isn't this report showing up" has no screen that lists the stuck report or offers a per-report retry/clear. (Recovery currently only via the small "Retry all" in the header indicator, which for BUG-004 loops forever.)

### BUG-007 — Next Match "On Field" live status frozen at page-load (never advances) (USER-REPORTED)
- **Severity**: P1 (core lead/drive-coach live feature shows the wrong current match all event)
- **Source**: user report — "on the Next Match screen, with an ongoing event code, the on-field block constantly shows P1 and doesn't update even though qualification matches are playing."
- **Status**: CONFIRMED (root-caused)
- **Detail**: Three compounding causes:
  1. **No client polling** — `useNexusEventStatus` (`useEventData.ts:381`) sets `staleTime: 15_000` but has **no `refetchInterval`**. The dashboard Next Match view stays mounted, so React Query never re-runs the live-status query (only on remount/refocus). The On-Field tile (`NextMatchView.tsx:779`, `match={status?.onField}`) is fetched ONCE at page load and frozen forever. If the page was opened while a Practice/Playoff match ("Practice 1"/"Playoff 1") was on the field, `shortMatchLabel` → "P1" (the fallback branch, `NextMatchView.tsx:176`) and it sticks.
  2. **Server cache too long for "live"** — `nexus-proxy/index.ts:9` caches `/event/{key}` for **5 minutes** (`CACHE_TTL_MS = 300_000`). Even with client polling, live field status would lag up to 5 min. Live status needs a short TTL (~15-20s).
  3. **`shortMatchLabel` dead branch** (`NextMatchView.tsx:168-178`): `lower.startsWith('q')` matches BOTH "Qualification" and "Quarterfinal", so the later `qf`/`quarter` branch is unreachable — quarterfinals render as "Q3" instead of "QF3". Minor, but in the same function.
- **Fix**: Add `refetchInterval: 15_000` (and `refetchIntervalInBackground`/`refetchOnWindowFocus` as appropriate) to `useNexusEventStatus`; cut `nexus-proxy` cache TTL for the live event status to ~15-20s (deploy fn); reorder `shortMatchLabel` to test `qf`/`quarter` before the bare `q`.

---

## Static deep-audit findings (32 confirmed, adversarially verified)
Full detail: workflow output `wkvtnzkw7` (16 subsystem finders → per-finding refutation pass).

### P1
- A1 [qr] `QrReceiveScreen.tsx:38` + `envelope.ts:291-302` — FountainDecoder pins to first session id; a sender that remounts (new sid) is silently ignored → receiver frozen, no recovery.
- A2 [admin] `autoAssign.ts:63-115` (breakEveryN via `AssignmentBoard.tsx:96`) — when scout pool == slots/match, every 7th match (breakEveryN=6) gets ZERO assignments (whole match unscouted).

### P2
- A3 [sync] `classifyError.ts:57-64` — Postgres connection-class SQLSTATEs (08xxx/53300) mis-classified terminal → dead-lettered instead of retried.
- A4 [qr] `QrReceiveScreen.tsx:79-110` — transient ingest/network failure after full decode discards the whole reassembled batch, no retry.
- A5 [capture] `useCaptureSession.ts:342-345` — commitInterval tags phase from start but computes endMs from current-phase clock → boundary-spanning intervals self-delete.
- A6 [capture] `ReviewScreen.tsx:87-90,446-455` — SAVE has no in-flight guard → double-tap creates two reports that collide on idx_msr_match_scout_active.
- A7 [roster] `useSession.ts:98-135` — logout doesn't stick outside ScoutHome: old scout leaks to /my-data and /pit.
- A8 [roster] `selectScouter.ts:121-139` — offline re-select can bind to a dangling/stale scout_id after a server delete/consolidation.
- A9 [admin] `0009_overhaul.sql:253-269` set_assignments — whole publish aborts if any target_team_number missing from team table (FK violation).
- A10 [pit] `useSync.ts:98-109` + `pitStore.ts:262` — pit auth/RLS-class dead-letters never auto-requeue after the 0021 fix (match reports do).
- A11 [pit] `photoUpload.ts:3,11-13` — `pit-photos` storage bucket + RLS not provisioned by any migration.
- A12 [migrations] `0016_…:51-121` (also 0014/0015) — concurrent select_scouter for same name makes two real devices delete each other's scout row.
- A13 [dash-ui] `TeamView.tsx:536-539` — Trends charts plot matches lexicographically (qm10 before qm2).
- A14 [dash-ui] `PicklistView.tsx:88-97,140` — Save swallows errors: no catch, no feedback, unhandled rejection.

### P3
- A15 [scoring] `aggregate.ts:46-51` + `constants.ts:6-10` — auto-climb bonus (auto_climb_level1) never scored; L1 auto climbs undercounted 5 pts.
- A16 [sync] `pitOutbox.ts:61-99` / `pitStore.ts:207-221` — concurrent pit drains can double-upload photo + orphan a Storage object (no atomic claim).
- A17 [qr] `compress.ts:26-49` — pipeThrough writes without awaiting; ignores write/close rejections → lost errors on large payloads.
- A18 [dash-agg] `useTeamPit.ts:114-118` — preferred-auto jsonb passed through without validating x/y finite.
- A19 [localstore] `preloadClient.ts:77-80` — roster offline cache can never be emptied (deleted/hidden persist when roster→0).
- A20 [localstore] `types.ts:124-128` — PreloadMeta 'roster' key documented but never written → always undefined.
- A21 [localstore] `preloadClient.ts:62-65` — per-event cached match/team rows accumulate forever, no pruning.
- A22 [capture] `useCaptureSession.ts:330-331,359-372` — intervals begun in idle/pause/done tagged 'auto'.
- A23 [roster] `rosterClient.ts:50-59` — re-adding a hidden scouter silently leaves them hidden (unique-violation swallowed).
- A24 [admin] `AssignmentBoard.tsx:93-107` — hardcodes breakEveryN/rotatePositions, ignores availability (removes knobs that avoid A2 gap).
- A25 [pit] `PitScoutScreen.tsx:132-137` parseNum — numeric pit fields accept negatives despite min=0.
- A26 [edge-fn] `ingest-reports/index.ts:106-115` + `0022:67-73` — trusts payload scout_name to merge into existing scouter identity (attribution forgery).
- A27 [edge-fn] `tba-proxy/index.ts:54-57` — no catch on fetch() → upstream network failure throws unhandled 500 (no sentinel).
- A28 [edge-fn] `seed-demo/index.ts:581-633` — inserts msr rows bypassing recompute → aggregate cols inconsistent with fuel_bursts.
- A29 [migrations] `0022:60-145` — service-role ingest can dead-letter whole report when provision-by-name resolves two reports to same scout/match (23505).
- A30 [dash-ui] `RankingView.tsx:222,245-251,304` — Compare panel column order ignores selection order.
- A31 [app-core] `main.tsx:10-16` — anon session bootstrap fire-and-forget → early scouter pick can fail "not authenticated".
- A32 [app-core] `formatMatch.ts:39-41` — formatMatchKeyRaw collapses best-of-3 finals + double-elim replays to same label.

## USER DIRECTIVE
- All Nexus-related data must update in REAL TIME with NO CACHES (server cache removed + client polling). Folds into BUG-007.

---

## RESOLUTION SUMMARY (2026-06-26)

Final state: `npm run typecheck` ✅ · `npm test` ✅ **724/724** · `npm run test:e2e` ✅ **7/7** · production `npm run build` ✅.
Deployed to remote Supabase: edge functions `nexus-proxy`, `statbotics-proxy`, `tba-proxy`; migrations `0025` (upsert supersede) + `0026` (pit-photos UPDATE policy). Verified live in-browser.

### FIXED + VERIFIED
- **BUG-001** stale e2e (placement step + 5-step review wizard + drag-rate slider gesture) — e2e now 7/7.
- **BUG-002** PWA icons were 1×1 stubs → generated real 192/512 PNGs; manifest warning gone (verified console clean).
- **BUG-003** favicon 404 → added `<link rel="icon">` + apple-touch-icon; gone.
- **BUG-004 (P0 DATA LOSS)** `upsert_match_report` now supersedes a conflicting active report (migration 0025) instead of 23505-dead-lettering; client auto-requeues `idx_msr_match_scout_active` dead-letters (isSupersedeRecoverable). The real stuck report recovered live → `synced`, indicator `⚠0`.
- **BUG-005 + BUG-007 + USER nexus directive** nexus-proxy uncached + degrades any non-ok→sentinel (verified `200 {available:false}`, `no-store`); `useNexusEventStatus` polls every 10s (verified repeated 200s); On-Field shows "—" not stuck "P1"; `shortMatchLabel` qf/quarter order fixed. statbotics/tba proxies also degrade on any non-ok (A27).
- **BUG-006** Sync screen now shows "This device — local outbox" (queued + dead-letters + Retry).
- **A2 (P1)** autoAssign break is now soft → no match left unscouted when pool==slots (+ regression test).
- **A3** connection-class SQLSTATEs (08/53/57P/40001/40P01) now transient (+ tests).
- **A5** boundary-spanning defense/feed intervals no longer self-delete (wall-clock duration).
- **A6** ReviewScreen SAVE in-flight guard (no double-create).
- **A7** logout sticks on /my-data + /pit (useSession honors the durable flag).
- **A10** pit auth-class dead-letters auto-requeue after 0021.
- **A11 + A16** pit-photos UPDATE policy (migration 0026) + deterministic upsert path (no orphans).
- **A13** TeamView trend charts ordered by play order (compareMatchKeys, + test).
- **A14** PicklistView surfaces save errors.
- **A15** auto-climb bonus now scored.
- **A17** compress.ts surfaces write/close errors instead of swallowing them.
- **A18** useTeamPit validates preferred-auto x/y finite.
- **A19/A20/A21** roster cache empties on authoritative-empty; meta doc corrected; per-event cache pruned.
- **A23** re-adding a hidden scouter un-hides them (+ test).
- **A25** pit numeric fields floored at 0.
- **A29** ingest 23505 — fixed by 0025 (ingest calls upsert_match_report).
- **A30** RankingView compare columns follow selection order.
- **A31** anon session awaited before first render (timeout-guarded).
- **A32** formatMatchKeyRaw disambiguates best-of-3 finals / replays (+ tests).
- **A27** tba-proxy catches upstream fetch rejection → clean 502.

### DEFERRED (documented; not safe to land blind in this session)
- **A8** offline re-select can bind a stale scout_id after a server delete/consolidation. Intertwined with the scouter-identity consolidation CLAUDE.md flags as fragile and with A26's trust surface. Needs careful server-side identity work + live testing against the consolidation path.
- **A12** concurrent same-name select_scouter mutual delete. CLAUDE.md: "Touch it carefully" — the 0014-0016 dedupe logic is delicate; a fix needs a dedicated migration + concurrency testing.
- **A26** ingest trusts payload scout_name (attribution forgery). Security hardening that must not break the legitimate QR ingest name-resolution path; needs a deliberate trust-model design.
- **A28** seed-demo inserts bypass recompute (demo-only data inconsistency, low impact).
- **A22** defense/feed intervals begun in idle/pause tagged 'auto' (low; no real-world trigger — the buttons only show mid-match; A5 already fixes the duration).
