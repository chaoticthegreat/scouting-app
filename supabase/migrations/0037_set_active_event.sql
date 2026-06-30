-- 0037_set_active_event.sql — atomic single-active-event flip (BUG-15).
--
-- BUG: src/dash/setActiveEvent.ts flipped is_active with TWO sequential UPDATEs
-- ("clear all others", then "set this one"). Between those statements a concurrent
-- reader (ScoutHome's `select event_key where is_active = true`, the dashboard's
-- active-event query) can observe ZERO active events — the schedule/picker then
-- briefly reads "No active event" and the scout home gate flashes empty.
--
-- FIX: a single SECURITY DEFINER RPC sets is_active in ONE statement/transaction:
--   update event set is_active = (event_key = p_event_key)
-- Every row is rewritten atomically, so a reader inside the same DB always sees
-- exactly one active event (the target). Mirrors the open lead-operation posture of
-- delete_event (0017) / select_scouter — granted to anon + authenticated since the
-- app is login-less. Re-apply safe (create or replace).

create or replace function set_active_event(p_event_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- One statement: the target becomes active, all others inactive, atomically.
  update event set is_active = (event_key = p_event_key);
end;
$$;

grant execute on function set_active_event(text) to anon, authenticated;
