-- 0013_seed_event_scouts_from_roster.sql
-- Auto-generate assignments was only possible for events that already had rows
-- in the per-event `scout` table (populated when a scouter picks their roster
-- name on their device via select_scouter). A freshly imported event (e.g.
-- 2026caetb) has zero `scout` rows, so the lead's "Auto-generate" button stayed
-- disabled (scouts.length === 0) and assignments could never be built.
--
-- This RPC seeds a `scout` row for every persistent roster name that isn't yet
-- present at the event, so the lead can assign the whole roster up-front without
-- waiting for every device to check in. assignment.scout_id references scout(id),
-- so seeding real scout rows keeps publish (set_assignments) FK-valid.
--
-- Idempotent: existing event scouts are left untouched; only missing roster
-- names are inserted. Returns the full (id, display_name) list for the event.

create or replace function seed_event_scouts_from_roster(p_event_key text)
  returns table (id uuid, display_name text)
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- Insert a scout row for each roster name not already at this event.
  -- auth_uid is globally unique + not null, so synthesize a uuid per seeded row.
  insert into scout (event_key, display_name, auth_uid)
  select p_event_key, r.name, gen_random_uuid()
  from scouter_roster r
  where not exists (
    select 1 from scout s
    where s.event_key = p_event_key
      and lower(s.display_name) = lower(r.name)
  );

  return query
    select s.id, s.display_name
    from scout s
    where s.event_key = p_event_key
    order by s.display_name asc;
end;
$$;

grant execute on function seed_event_scouts_from_roster(text) to anon, authenticated;
