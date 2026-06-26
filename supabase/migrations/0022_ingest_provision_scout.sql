-- 0022_ingest_provision_scout.sql — Fix QR "Receive over QR" landing 0 reports.
--
-- ROOT CAUSE (confirmed from prod postgres logs: repeated
-- 'invalid scout_id: no such scout'): the QR/cross-device ingest path runs the
-- ingest-reports Edge Function with a SERVICE-ROLE client (auth.uid() NULL) and
-- carries reports authored on ANOTHER device. Those reports reference the
-- SENDER's scout_id. Scout rows are PER-DEVICE — `scout` is unique on
-- (event_key, auth_uid) and each device has its own anonymous auth.uid — and
-- select_scouter (0014-0016) DELETES duplicate same-named scout rows. So on the
-- receiver the carried scout_id frequently does NOT exist, the 0012
-- referential-sanity gate raises 23503 on EVERY report, ingest-reports returns
-- { ingested: 0, failed: [...] }, and the whole backlog is silently lost — the
-- exact opposite of what QR transfer is for (recovering a wiped/foreign sender).
--
-- Note: merely guarding the 23503 gate is NOT enough — the
-- match_scouting_report.scout_id FK would still reject a missing scout row.
--
-- FIX: keep the existing referential gate for AUTHENTICATED callers (the online
-- outbox, whose own scout row always exists). For the SERVICE-ROLE path
-- (auth.uid() NULL) RESOLVE/PROVISION a real scout row so the report lands:
--   1. If the carried scout_id already exists, use it.
--   2. Else, if the report carries a `scout_name` (the QR sender tags it from
--      its identity cache), re-attach to an existing same-named scout for that
--      event — so recovered reports merge into the LIVE scouter identity.
--   3. Else create a placeholder scout row that CARRIES the original scout_id
--      (so a later direct sync from the origin device is an idempotent no-op),
--      named from `scout_name` when present, otherwise 'Imported scout'.
--
-- ADDITIVE / verbatim: this is the 0012 body with ONLY the scout gate replaced
-- by the resolve/provision block and the INSERT using the resolved scout_id.
-- `scout_name` is ignored on the authenticated path and is NOT part of the
-- shared online wire shape (mapReport.ts), so the outbox is unaffected.

create or replace function upsert_match_report(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p->>'id')::uuid;
  v_incoming_rev bigint := coalesce((p->>'row_revision')::bigint, 1);
  v_existing_rev bigint;
  v_scout_id uuid := (p->>'scout_id')::uuid;
  v_event_key text := p->>'event_key';
  v_scout_name text := nullif(btrim(p->>'scout_name'), '');
  v_resolved_scout uuid;
begin
  perform set_config('app.skip_msr_bump', 'on', true);

  if auth.uid() is not null then
    -- AUTHENTICATED (online outbox): referential sanity only — the scout_id must
    -- reference a real scout row (login-less open posture, 0012). This device's
    -- own scout row always exists (select_scouter keeps the row keyed on this
    -- auth.uid), so this never blocks a device's own sync.
    if not exists (select 1 from scout s where s.id = v_scout_id) then
      raise exception 'invalid scout_id: no such scout' using errcode = '23503';
    end if;
    v_resolved_scout := v_scout_id;
  else
    -- SERVICE-ROLE (QR / cross-device ingest): the carried scout_id belongs to
    -- another device and may not exist here. Resolve or provision a real scout
    -- row so the report lands instead of dead-lettering the whole batch.
    if exists (select 1 from scout s where s.id = v_scout_id) then
      v_resolved_scout := v_scout_id;
    else
      if v_scout_name is not null then
        select s.id into v_resolved_scout
        from scout s
        where s.event_key = v_event_key
          and lower(s.display_name) = lower(v_scout_name)
        order by s.created_at
        limit 1;
      end if;
      if v_resolved_scout is null then
        insert into scout (id, event_key, display_name, auth_uid)
        values (
          v_scout_id,
          v_event_key,
          coalesce(v_scout_name, 'Imported scout'),
          gen_random_uuid()
        )
        on conflict (id) do nothing;
        v_resolved_scout := v_scout_id;
      end if;
    end if;
  end if;

  select row_revision into v_existing_rev
  from match_scouting_report where id = v_id;

  if v_existing_rev is null then
    insert into match_scouting_report (
      id, schema_version, app_version, device_id, event_key, match_key, scout_id,
      target_team_number, alliance_color, station, inactive_first, inactive_first_source,
      teleop_clock_unconfirmed, fuel_bursts, feeding_bursts, climb_level, climb_attempted, climb_success,
      auto_start_position, auto_path, auto_left_starting_line, auto_climb_level1,
      intake_sources, max_fuel_capacity_observed, defense_rating, pins, fouls_minor,
      fouls_major, no_show, died, tipped, dropped_fuel, fed_corral, notes,
      defense_duration_ms, defended_duration_ms, defense_intervals, defended_intervals,
      row_revision, deleted
    ) values (
      v_id,
      (p->>'schema_version')::int,
      p->>'app_version',
      p->>'device_id',
      p->>'event_key',
      p->>'match_key',
      v_resolved_scout,
      (p->>'target_team_number')::int,
      p->>'alliance_color',
      (p->>'station')::int,
      (p->>'inactive_first')::boolean,
      p->>'inactive_first_source',
      coalesce((p->>'teleop_clock_unconfirmed')::boolean, false),
      coalesce(p->'fuel_bursts', '[]'::jsonb),
      coalesce(p->'feeding_bursts', '[]'::jsonb),
      coalesce((p->>'climb_level')::int, 0),
      coalesce((p->>'climb_attempted')::boolean, false),
      coalesce((p->>'climb_success')::boolean, false),
      p->'auto_start_position',
      p->'auto_path',
      coalesce((p->>'auto_left_starting_line')::boolean, false),
      coalesce((p->>'auto_climb_level1')::boolean, false),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p->'intake_sources','[]'::jsonb)) as value),
        '{}'::text[]),
      coalesce((p->>'max_fuel_capacity_observed')::int, 0),
      coalesce((p->>'defense_rating')::int, 0),
      coalesce((p->>'pins')::int, 0),
      coalesce((p->>'fouls_minor')::int, 0),
      coalesce((p->>'fouls_major')::int, 0),
      coalesce((p->>'no_show')::boolean, false),
      coalesce((p->>'died')::boolean, false),
      coalesce((p->>'tipped')::boolean, false),
      coalesce((p->>'dropped_fuel')::boolean, false),
      coalesce((p->>'fed_corral')::boolean, false),
      p->>'notes',
      coalesce((p->>'defense_duration_ms')::int, 0),
      coalesce((p->>'defended_duration_ms')::int, 0),
      coalesce(p->'defense_intervals', '[]'::jsonb),
      coalesce(p->'defended_intervals', '[]'::jsonb),
      v_incoming_rev,
      coalesce((p->>'deleted')::boolean, false)
    );
  elsif v_incoming_rev > v_existing_rev then
    update match_scouting_report set
      schema_version = (p->>'schema_version')::int,
      app_version = p->>'app_version',
      device_id = p->>'device_id',
      target_team_number = (p->>'target_team_number')::int,
      alliance_color = p->>'alliance_color',
      station = (p->>'station')::int,
      inactive_first = (p->>'inactive_first')::boolean,
      inactive_first_source = p->>'inactive_first_source',
      teleop_clock_unconfirmed = coalesce((p->>'teleop_clock_unconfirmed')::boolean, false),
      fuel_bursts = coalesce(p->'fuel_bursts', '[]'::jsonb),
      feeding_bursts = coalesce(p->'feeding_bursts', '[]'::jsonb),
      climb_level = coalesce((p->>'climb_level')::int, 0),
      climb_attempted = coalesce((p->>'climb_attempted')::boolean, false),
      climb_success = coalesce((p->>'climb_success')::boolean, false),
      auto_start_position = p->'auto_start_position',
      auto_path = p->'auto_path',
      auto_left_starting_line = coalesce((p->>'auto_left_starting_line')::boolean, false),
      auto_climb_level1 = coalesce((p->>'auto_climb_level1')::boolean, false),
      intake_sources = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p->'intake_sources','[]'::jsonb)) as value),
        '{}'::text[]),
      max_fuel_capacity_observed = coalesce((p->>'max_fuel_capacity_observed')::int, 0),
      defense_rating = coalesce((p->>'defense_rating')::int, 0),
      pins = coalesce((p->>'pins')::int, 0),
      fouls_minor = coalesce((p->>'fouls_minor')::int, 0),
      fouls_major = coalesce((p->>'fouls_major')::int, 0),
      no_show = coalesce((p->>'no_show')::boolean, false),
      died = coalesce((p->>'died')::boolean, false),
      tipped = coalesce((p->>'tipped')::boolean, false),
      dropped_fuel = coalesce((p->>'dropped_fuel')::boolean, false),
      fed_corral = coalesce((p->>'fed_corral')::boolean, false),
      notes = p->>'notes',
      defense_duration_ms = coalesce((p->>'defense_duration_ms')::int, 0),
      defended_duration_ms = coalesce((p->>'defended_duration_ms')::int, 0),
      defense_intervals = coalesce(p->'defense_intervals', '[]'::jsonb),
      defended_intervals = coalesce(p->'defended_intervals', '[]'::jsonb),
      deleted = coalesce((p->>'deleted')::boolean, false),
      row_revision = v_incoming_rev
    where id = v_id;
  else
    perform set_config('app.skip_msr_bump', 'off', true);
    return;
  end if;

  perform recompute_match_report_aggregates(v_id);
  perform set_config('app.skip_msr_bump', 'off', true);
end;
$$;

grant execute on function upsert_match_report(jsonb) to anon, authenticated;
