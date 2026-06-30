-- 0038_delete_event_orphans.sql — delete_event leaves orphaned rows (BUG-16).
--
-- BUG: delete_event (0017) removes the event's match/scout/assignment/report rows
-- and the event itself, but NOT two event-scoped tables that carry NO FK to event
-- (so the cascade can't reach them and the DELETE doesn't either):
--   * matchup_note_history (0033) — history snapshots of matchup notes. The live
--     matchup_note rows DO FK event(event_key) ON DELETE CASCADE, so deleting the
--     event drops them, but their history rows linger forever.
--   * nexus_event_status (0027) — the latest live-field snapshot, keyed by
--     event_key with NO FK (a push may precede import). Lingers after delete.
-- Re-importing the same event_key then resurfaces stale history/field data.
--
-- FIX: CREATE OR REPLACE delete_event to also clear those two tables. matchup_note
-- history must go BEFORE we delete the event (the event delete cascades the live
-- matchup_note rows, but never their history). Everything from 0017 is kept verbatim
-- and the order is unchanged; only the two new deletes are added. Re-apply safe.

create or replace function delete_event(p_event_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Children that FK match/scout/team must go before match/scout (and the event).
  delete from match_scouting_report where event_key = p_event_key;
  delete from assignment where event_key = p_event_key;
  delete from pit_scouting_report where event_key = p_event_key;
  -- History table has no FK, but is event-scoped — drop it too so nothing dangles.
  delete from pit_report_history where event_key = p_event_key;
  -- Matchup-note history (0033) has no FK to event; the live matchup_note rows
  -- cascade with the event below, but their history snapshots do not — clear them.
  delete from matchup_note_history where event_key = p_event_key;
  -- Nexus live-field snapshot (0027) is keyed by event_key with no FK — clear it so
  -- a re-import of the same key doesn't resurface a stale field status.
  delete from nexus_event_status where event_key = p_event_key;
  -- Now the event's own first-level dependents.
  delete from scout where event_key = p_event_key;
  delete from match where event_key = p_event_key;
  delete from event_team where event_key = p_event_key;
  -- Finally the event itself (cascades event_secret + picklist + matchup_note).
  delete from event where event_key = p_event_key;
end;
$$;

grant execute on function delete_event(text) to anon, authenticated;
