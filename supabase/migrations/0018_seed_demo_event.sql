-- 0018_seed_demo_event.sql
-- BACKEND of "demo mode": one SECURITY DEFINER RPC that seeds a complete, realistic
-- fake event so every dashboard visualization populates (Ranking, Team, Match,
-- Picklist, Next-Match prediction, Scouter-performance, Auto Routines, report
-- timelines, pit panels). The frontend toggles this on by calling
-- seed_demo_event('2026demo') and tears it down via delete_event('2026demo')
-- (migration 0017). Granted to anon + authenticated to match the login-less posture.
--
-- The function is fully idempotent: it FK-safely clears any prior rows for the
-- demo event_key first (the SAME order as delete_event, minus the shared `team`
-- delete — teams are global, one row per team_number across events), then re-seeds.
-- It never touches other events' is_active (the frontend activates the demo event),
-- and never pollutes the global scouter_roster table.

-- Deterministic per-team latent skill in [0,1) from the team_number, so a team is
-- consistently strong/weak across all its matches (stable, meaningful rankings).
-- 3256 is pinned clearly strong-ish. Defined first so seed_demo_event can call it.
create or replace function skill_of(p_team int)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_team = 3256 then 0.82
    -- hash the team number into a stable [0,1) spread
    else ((abs(hashint4(p_team)) % 1000) / 1000.0)
  end;
$$;

grant execute on function skill_of(int) to anon, authenticated;

create or replace function seed_demo_event(p_event_key text default '2026demo')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ── tuning ────────────────────────────────────────────────────────────────
  n_teams       int := 30;              -- 3256 + 29 demo teams (9001..9029)
  n_matches     int := 60;              -- qual schedule (all comp_level 'qm')
  n_scouts      int := 8;
  played_cutoff int;                    -- match_numbers <= this are PLAYED
  base_ts       timestamptz := date_trunc('day', now());

  team_list     int[];                  -- ordered list of demo team numbers
  scout_ids     uuid[];                 -- demo scout ids, round-robin target

  -- per-match working vars
  m             int;                    -- match_number
  mk            text;                   -- match_key
  i0            int;                    -- rotating index into team_list
  reds          int[];
  blues         int[];
  is_played     boolean;
  red_sum       int;
  blue_sum      int;
  r_score       int;
  b_score       int;
  r_autofuel    int;
  b_autofuel    int;
  w             text;
  team_no       int;
  ac            text;                   -- alliance_color
  st            int;                    -- station 1..3
  k             int;

  -- per-report working vars derived from latent skill
  skill         numeric;                -- 0..1 latent strength
  reliability   numeric;
  climb_prop    numeric;
  mean_total    numeric;
  v_auto        int;
  v_tele_act    int;
  v_tele_inact  int;
  v_endgame     int;
  v_total       int;
  v_fuel_pts    int;
  v_conf        numeric;
  v_climb_lvl   int;
  v_climb_att   boolean;
  v_climb_succ  boolean;
  v_def         int;
  v_noshow      boolean;
  v_died        boolean;
  v_inactive_first boolean;
  shift_arr     int[];
  v_bursts      jsonb;
  v_startpos    jsonb;
  v_path        jsonb;
  scout_idx     int := 0;               -- round-robin cursor across the match
  sx            int;
begin
  -- ── 1. Idempotent teardown (FK-safe, mirrors delete_event minus the team delete) ─
  delete from match_scouting_report where event_key = p_event_key;
  delete from assignment            where event_key = p_event_key;
  delete from pit_scouting_report   where event_key = p_event_key;
  delete from pit_report_history    where event_key = p_event_key;
  delete from scout                 where event_key = p_event_key;
  delete from match                 where event_key = p_event_key;
  delete from event_team            where event_key = p_event_key;
  delete from event                 where event_key = p_event_key;

  played_cutoff := (n_matches * 7) / 10;   -- ~70% of matches are played

  -- ── 2. event row ───────────────────────────────────────────────────────────
  insert into event (event_key, name, start_date, end_date, timezone, city,
                     state_prov, is_active, staged_fuel_per_match, imported_at)
  values (
    p_event_key,
    'Demo Event — REBUILT (simulated)',
    (base_ts)::date,
    (base_ts + interval '1 day')::date,
    'America/New_York',
    'Demo City', 'NY',
    false,                  -- frontend activates it; never touch other events
    504,
    now()
  );

  -- ── 3. teams (3256 + 9001..9029), global rows via on conflict do nothing ────
  team_list := array[3256];
  for k in 1 .. (n_teams - 1) loop
    team_list := team_list || (9000 + k);
  end loop;

  insert into team (team_number, nickname, city, state_prov, rookie_year)
  values (3256, 'RoboDevils (demo)', 'Demo City', 'NY', 2010)
  on conflict (team_number) do nothing;

  for k in 1 .. (n_teams - 1) loop
    insert into team (team_number, nickname, city, state_prov, rookie_year)
    values (9000 + k, 'Demo Bot ' || (9000 + k), 'Demo City', 'NY', 2018)
    on conflict (team_number) do nothing;
  end loop;

  -- event_team join for all teams
  foreach team_no in array team_list loop
    insert into event_team (event_key, team_number)
    values (p_event_key, team_no)
    on conflict (event_key, team_number) do nothing;
  end loop;

  -- ── 4. demo scouts (do NOT touch scouter_roster) ───────────────────────────
  for k in 1 .. n_scouts loop
    insert into scout (event_key, display_name, auth_uid)
    values (p_event_key, 'Demo Scout ' || k, gen_random_uuid());
  end loop;
  -- collect the scout ids we just created (deterministic by display_name order)
  select array_agg(id order by display_name) into scout_ids
  from scout where event_key = p_event_key;

  -- ── 5. matches + 7. reports + 9. assignments ───────────────────────────────
  for m in 1 .. n_matches loop
    mk := p_event_key || '_qm' || m;
    -- rotate a 6-team window through the team list (distinct within a match)
    i0 := ((m - 1) * 6) % n_teams;
    reds := array[
      team_list[1 + ((i0 + 0) % n_teams)],
      team_list[1 + ((i0 + 1) % n_teams)],
      team_list[1 + ((i0 + 2) % n_teams)]
    ];
    blues := array[
      team_list[1 + ((i0 + 3) % n_teams)],
      team_list[1 + ((i0 + 4) % n_teams)],
      team_list[1 + ((i0 + 5) % n_teams)]
    ];
    -- guarantee 3256 plays regularly: inject into every ~5th match if absent
    if (m % 5 = 0) and not (3256 = any(reds) or 3256 = any(blues)) then
      reds[1] := 3256;
    end if;

    is_played := (m <= played_cutoff);

    if is_played then
      -- alliance scores derived from participating teams' latent skill + noise
      red_sum := 0; blue_sum := 0;
      foreach team_no in array reds loop
        red_sum := red_sum + (30 + (skill_of(team_no) * 100))::int;
      end loop;
      foreach team_no in array blues loop
        blue_sum := blue_sum + (30 + (skill_of(team_no) * 100))::int;
      end loop;
      r_score := (red_sum  + (random() * 40 - 20))::int;
      b_score := (blue_sum + (random() * 40 - 20))::int;
      r_autofuel := (10 + random() * 30)::int;
      b_autofuel := (10 + random() * 30)::int;
      if r_score > b_score then w := 'red';
      elsif b_score > r_score then w := 'blue';
      else w := 'tie';
      end if;

      insert into match (match_key, event_key, comp_level, match_number, scheduled_time,
                         red1, red2, red3, blue1, blue2, blue3,
                         actual_red_score, actual_blue_score, red_auto_fuel, blue_auto_fuel,
                         winner, result_synced_at)
      values (mk, p_event_key, 'qm', m,
              base_ts + (m * interval '7 minutes'),
              reds[1], reds[2], reds[3], blues[1], blues[2], blues[3],
              r_score, b_score, r_autofuel, b_autofuel, w, now());
    else
      insert into match (match_key, event_key, comp_level, match_number, scheduled_time,
                         red1, red2, red3, blue1, blue2, blue3)
      values (mk, p_event_key, 'qm', m,
              base_ts + (m * interval '7 minutes'),
              reds[1], reds[2], reds[3], blues[1], blues[2], blues[3]);
    end if;

    -- ── reports for played matches: one per participating team ───────────────
    if is_played then
      for k in 1 .. 6 loop
        if k <= 3 then
          team_no := reds[k];  ac := 'red';  st := k;
        else
          team_no := blues[k - 3]; ac := 'blue'; st := k - 3;
        end if;

        skill       := skill_of(team_no);
        reliability := 0.80 + skill * 0.18;                 -- 0.80..0.98
        climb_prop  := 0.25 + skill * 0.70;                 -- 0.25..0.95
        mean_total  := 30 + skill * 100;                    -- ~30..130 FUEL

        v_noshow := (random() < 0.03);
        v_died   := (random() < 0.05);

        if v_noshow then
          v_auto := 0; v_tele_act := 0; v_tele_inact := 0; v_endgame := 0;
          v_climb_lvl := 0; v_climb_att := false; v_climb_succ := false;
          v_def := 0; v_conf := 0.5;
          v_inactive_first := false;
          shift_arr := array[0,0,0,0];
          v_bursts := '[]'::jsonb;
          v_startpos := null; v_path := null;
        else
          -- distribute mean_total across phases with noise (died → teleop cut short)
          v_auto       := greatest(0, (mean_total * 0.18 * (0.6 + random() * 0.8))::int);
          v_tele_act   := greatest(0, (mean_total * 0.50 * (0.6 + random() * 0.8))::int);
          v_tele_inact := greatest(0, (mean_total * 0.18 * (0.6 + random() * 0.8))::int);
          v_endgame    := greatest(0, (mean_total * 0.14 * (0.6 + random() * 0.8))::int);
          if v_died then
            v_tele_act   := (v_tele_act * 0.4)::int;
            v_tele_inact := (v_tele_inact * 0.4)::int;
            v_endgame    := 0;
          end if;

          -- climb: attempt by propensity, success gated by reliability
          v_climb_att  := (random() < climb_prop) and not v_died;
          v_climb_succ := v_climb_att and (random() < reliability);
          if v_climb_succ then
            v_climb_lvl := least(3, 1 + (random() * 3)::int);   -- 1..3
          else
            v_climb_lvl := 0;
          end if;

          v_def  := (random() * 4)::int;            -- 0..3 (clamped below)
          if v_def > 3 then v_def := 3; end if;
          v_conf := 0.5 + random() * 0.5;            -- 0.5..1.0

          -- inactive_first derived flag
          v_inactive_first := (v_tele_inact > 0) and (random() < 0.4);

          -- fuel_by_shift: 4 teleop shift buckets summing ~ active+inactive
          declare
            shift_total int := v_tele_act + v_tele_inact;
            a int; b int; c int; d int;
          begin
            a := (shift_total * 0.30)::int;
            b := (shift_total * 0.30)::int;
            c := (shift_total * 0.25)::int;
            d := greatest(0, shift_total - a - b - c);
            shift_arr := array[a, b, c, d];
          end;

          -- a few plausible fuel_bursts (timeline/report-detail viz).
          -- window 'auto' → startMs absolute in auto-time [0,20000);
          -- teleop windows → startMs relative to teleop start (timeline adds AUTO_MS).
          v_bursts := jsonb_build_array(
            jsonb_build_object('rate', round((1.5 + random())::numeric, 2),
                               'startMs', 3000,  'endMs', 9000,  'window', 'auto'),
            jsonb_build_object('rate', round((2.0 + random())::numeric, 2),
                               'startMs', 8000,  'endMs', 20000, 'window', 'shift1'),
            jsonb_build_object('rate', round((2.0 + random())::numeric, 2),
                               'startMs', 45000, 'endMs', 62000, 'window', 'shift2'),
            jsonb_build_object('rate', round((1.5 + random())::numeric, 2),
                               'startMs', 95000, 'endMs', 110000,'window', 'shift3')
          );

          -- auto_start_position {x,y} and auto_path [{x,y}...] (field 0..1 coords)
          v_startpos := jsonb_build_object(
            'x', round((0.05 + random() * 0.15)::numeric, 3),
            'y', round((0.15 + random() * 0.70)::numeric, 3));
          v_path := jsonb_build_array(
            v_startpos,
            jsonb_build_object('x', round((0.30 + random() * 0.15)::numeric, 3),
                               'y', round((0.20 + random() * 0.60)::numeric, 3)),
            jsonb_build_object('x', round((0.55 + random() * 0.15)::numeric, 3),
                               'y', round((0.20 + random() * 0.60)::numeric, 3)));
        end if;

        v_total    := v_auto + v_tele_act + v_tele_inact + v_endgame;
        v_fuel_pts := v_auto + v_tele_act + v_endgame;  -- spec: excludes inactive

        -- round-robin scout assignment across the demo scouts
        scout_idx := scout_idx + 1;
        sx := 1 + (scout_idx % n_scouts);

        insert into match_scouting_report (
          schema_version, app_version, device_id,
          event_key, match_key, scout_id, target_team_number,
          alliance_color, station,
          inactive_first, inactive_first_source,
          fuel_bursts,
          auto_fuel, teleop_fuel_active, teleop_fuel_inactive, endgame_fuel,
          fuel_by_shift, fuel_points, fuel_estimate_confidence,
          climb_level, climb_attempted, climb_success,
          auto_start_position, auto_path, auto_left_starting_line, auto_climb_level1,
          intake_sources, max_fuel_capacity_observed,
          defense_rating, pins, fouls_minor, fouls_major,
          no_show, died, tipped, dropped_fuel, fed_corral,
          defense_duration_ms, defended_duration_ms,
          notes, deleted
        ) values (
          1, 'demo', 'demo-device',
          p_event_key, mk, scout_ids[sx], team_no,
          ac, st,
          v_inactive_first, case when v_inactive_first then 'derived' else null end,
          v_bursts,
          v_auto, v_tele_act, v_tele_inact, v_endgame,
          shift_arr, v_fuel_pts, round(v_conf, 2),
          v_climb_lvl, v_climb_att, v_climb_succ,
          v_startpos, v_path,
          (not v_noshow) and (random() < 0.9),
          (not v_noshow) and (random() < 0.10),
          case when v_def > 0 then array['ground','station'] else array['ground'] end::text[],
          greatest(0, (mean_total * 0.25 * (0.5 + random()))::int),
          v_def,
          case when v_def > 0 then (random() * 3)::int else 0 end,
          (random() * 2)::int,
          case when random() < 0.15 then 1 else 0 end,
          v_noshow, v_died,
          (random() < 0.05), (random() < 0.10), (random() < 0.20),
          case when v_def > 0 then (15000 + random() * 30000)::int else 0 end,
          (random() * 20000)::int,
          case
            when v_noshow then 'No show.'
            when v_died then 'Robot died mid-match.'
            when skill > 0.7 then 'Strong cycler, consistent shots.'
            when skill < 0.35 then 'Struggled to score, slow cycles.'
            else 'Solid contributor.'
          end,
          false
        );
      end loop;
    end if;
  end loop;

  -- ── 8. pit reports: one per team ───────────────────────────────────────────
  foreach team_no in array team_list loop
    skill := skill_of(team_no);
    insert into pit_scouting_report (
      event_key, team_number, drivetrain, mechanisms, capabilities,
      photo_path, notes, author_scout_id, deleted
    ) values (
      p_event_key, team_no,
      (array['swerve','tank','mecanum'])[1 + (team_no % 3)],
      to_jsonb(
        case when skill > 0.6
          then array['fuel shooter','climber','fast intake']
          else array['fuel shooter','floor intake']
        end
      ),
      jsonb_build_object(
        'items',
          case when skill > 0.6
            then array['high goal','level 3 climb','auto routine','defense']
            else array['low goal','level 1 climb']
          end,
        'intakeSources', array['ground','station']
      ),
      null,
      'Demo pit notes for team ' || team_no || '.',
      scout_ids[1 + (team_no % n_scouts)],
      false
    );
  end loop;

  -- ── 9. assignments: map demo scouts onto UNPLAYED matches (source 'auto') ───
  insert into assignment (event_key, match_key, scout_id, alliance_color, station,
                          target_team_number, source)
  select
    p_event_key,
    mt.match_key,
    scout_ids[1 + ((rn - 1) % n_scouts)],
    seat.ac,
    seat.st,
    case seat.idx
      when 1 then mt.red1 when 2 then mt.red2 when 3 then mt.red3
      when 4 then mt.blue1 when 5 then mt.blue2 else mt.blue3 end,
    'auto'
  from (
    select match_key, red1, red2, red3, blue1, blue2, blue3,
           row_number() over (order by match_number) as rn
    from match
    where event_key = p_event_key and winner is null
  ) mt
  cross join (values
    (1,'red'::text,1),(2,'red',2),(3,'red',3),
    (4,'blue'::text,1),(5,'blue',2),(6,'blue',3)
  ) as seat(idx, ac, st);
end;
$$;

grant execute on function seed_demo_event(text) to anon, authenticated;
