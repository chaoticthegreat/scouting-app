-- 0005_admin.sql — role-based access (additive over Phase 0 membership RLS).
-- SECURITY DEFINER helpers + staff read policies + set_assignments RPC.
-- Re-apply is safe: create-or-replace / drop-if-exists / drop policy if exists.

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: is_staff() — true if caller has role IN ('lead','admin').
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function is_staff()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from profile
    where auth_uid = auth.uid()
      and role in ('lead', 'admin')
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: is_admin() — true if caller has role = 'admin'.
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function is_admin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from profile
    where auth_uid = auth.uid()
      and role = 'admin'
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Staff read policies (additive permissive SELECT — Phase 0 policies remain).
-- ──────────────────────────────────────────────────────────────────────────────

drop policy if exists event_read_staff on event;
create policy event_read_staff on event
  for select to authenticated
  using (is_staff());

drop policy if exists event_team_read_staff on event_team;
create policy event_team_read_staff on event_team
  for select to authenticated
  using (is_staff());

drop policy if exists team_read_staff on team;
create policy team_read_staff on team
  for select to authenticated
  using (is_staff());

drop policy if exists match_read_staff on match;
create policy match_read_staff on match
  for select to authenticated
  using (is_staff());

drop policy if exists assignment_read_staff on assignment;
create policy assignment_read_staff on assignment
  for select to authenticated
  using (is_staff());

drop policy if exists scout_read_staff on scout;
create policy scout_read_staff on scout
  for select to authenticated
  using (is_staff());

drop policy if exists msr_read_staff on match_scouting_report;
create policy msr_read_staff on match_scouting_report
  for select to authenticated
  using (is_staff());

drop policy if exists pit_read_staff on pit_scouting_report;
create policy pit_read_staff on pit_scouting_report
  for select to authenticated
  using (is_staff());

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC: set_assignments — admin only; replaces all assignments for an event.
-- Returns count of inserted rows (skips null scout_id and cross-event matches).
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function set_assignments(p_event_key text, p_assignments jsonb)
  returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  -- Admin gate.
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- Delete all existing assignments for this event.
  delete from assignment where event_key = p_event_key;

  -- Insert valid rows: non-null scout_id AND match_key belongs to p_event_key.
  insert into assignment (event_key, match_key, scout_id, alliance_color, station, target_team_number, source)
  select
    p_event_key,
    (elem->>'match_key'),
    (elem->>'scout_id')::uuid,
    (elem->>'alliance_color'),
    (elem->>'station')::int,
    (elem->>'target_team_number')::int,
    'auto'
  from jsonb_array_elements(p_assignments) as elem
  where
    (elem->>'scout_id') is not null
    and exists (
      select 1 from match m
      where m.match_key = (elem->>'match_key')
        and m.event_key = p_event_key
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Grants to authenticated role.
-- ──────────────────────────────────────────────────────────────────────────────
grant execute on function is_staff() to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function set_assignments(text, jsonb) to authenticated;
