-- 0021_pit_write_open.sql — Fix login-less PIT report uploads being dead-lettered.
--
-- ROOT CAUSE: pit_scouting_report writes still go through a DIRECT table upsert
-- (src/pit/pitStore.ts → supabase.from('pit_scouting_report').upsert(...)), gated
-- by the per-uid ownership policies pit_insert_self (0003) and pit_update_self
-- (0006):
--
--     with check (
--       event_key       in (select get_my_event_keys())   -- scout WHERE auth_uid = auth.uid()
--       and author_scout_id in (select get_my_scout_ids()) -- scout WHERE auth_uid = auth.uid()
--     )
--
-- Login-less scouters run under a Supabase anonymous session (ensureAnonSession →
-- signInAnonymously), which IS in the `authenticated` role. The pit form's
-- author_scout_id comes from the selected roster/assignment scout, which routinely
-- is NOT the scout row bound to THIS device's auth.uid() (scouter identity is
-- fragile — see select_scouter 0014/0015/0016). When it isn't, the WITH CHECK
-- fails with SQLSTATE 42501, which classifySyncError treats as TERMINAL, so the
-- pit report is permanently DEAD-LETTERED in the outbox — the submit "succeeds"
-- locally but never reaches the server even with a perfectly good network.
--
-- This is the EXACT bug 0012 fixed for match reports (it relaxed upsert_match_report
-- to referential-sanity-only and granted anon). Match reports went through an RPC
-- with a revision guard + aggregate recompute, so an RPC made sense there. Pit
-- reports are a plain upsert on the (event_key, team_number) PK with no revision
-- guard and no server-side aggregates, so the minimal, consistent fix is to open
-- the WRITE policies the same way 0009 opened the dashboard/picklist/assignment
-- writes — no client change required.
--
-- Read is already open (pit_read_open, 0009). The restrictive pit_insert_self /
-- pit_update_self policies are left in place; RLS is OR across permissive policies,
-- so the open policies below simply grant the login-less path.

drop policy if exists pit_insert_open on pit_scouting_report;
create policy pit_insert_open on pit_scouting_report
  for insert to anon, authenticated
  with check (true);

drop policy if exists pit_update_open on pit_scouting_report;
create policy pit_update_open on pit_scouting_report
  for update to anon, authenticated
  using (true) with check (true);
