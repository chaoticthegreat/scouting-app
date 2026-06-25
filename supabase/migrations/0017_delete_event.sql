-- 0017_delete_event.sql
-- Lets the (login-less) lead permanently remove an imported event and ALL of its
-- data from the dashboard's Setup → Events area, so a wrong/test event stops
-- showing up in the switch-event list forever. The `event` row is FK-referenced
-- (no cascade) by event_team, match, scout, assignment, match_scouting_report, and
-- pit_scouting_report, so a plain DELETE is blocked. A SECURITY DEFINER RPC removes
-- the dependents first — in FK-safe order — then the event, in one transaction.
-- Mirrors the open lead-operation posture of 0009/0011 (granted to anon, authenticated).
--
-- Shared `team` rows are intentionally NOT touched: teams are global (one row per
-- team_number across all events), only the event_team join is event-scoped.
-- event_secret and picklist FK the event WITH `on delete cascade`, so deleting the
-- event removes them automatically.

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
  -- Now the event's own first-level dependents.
  delete from scout where event_key = p_event_key;
  delete from match where event_key = p_event_key;
  delete from event_team where event_key = p_event_key;
  -- Finally the event itself (cascades event_secret + picklist).
  delete from event where event_key = p_event_key;
end;
$$;

grant execute on function delete_event(text) to anon, authenticated;
