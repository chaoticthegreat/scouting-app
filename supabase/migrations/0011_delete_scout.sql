-- 0011_delete_scout.sql
-- Lets the (login-less) lead permanently remove a scouter and ALL of their data
-- from the dashboard's Scouters → Performance area. `scout` rows are FK-referenced
-- by match_scouting_report.scout_id (NOT NULL), assignment.scout_id, and
-- pit_scouting_report.author_scout_id (nullable), so a plain DELETE is blocked.
-- A SECURITY DEFINER RPC removes the dependents first, then the scout, in one txn.
-- Mirrors the open lead-operation posture of 0009 (granted to anon, authenticated).

create or replace function delete_scout(p_scout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Match reports are NOT NULL on scout_id → must be deleted, not orphaned.
  delete from match_scouting_report where scout_id = p_scout_id;
  -- Assignments belonging to this scout.
  delete from assignment where scout_id = p_scout_id;
  -- Pit reports keep their data; just drop the (nullable) author attribution.
  update pit_scouting_report set author_scout_id = null where author_scout_id = p_scout_id;
  -- Finally the scout row itself.
  delete from scout where id = p_scout_id;
end;
$$;

grant execute on function delete_scout(uuid) to anon, authenticated;
