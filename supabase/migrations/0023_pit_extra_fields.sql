-- 0023_pit_extra_fields.sql
-- Pit scouting gains structured fields beyond the original
-- drivetrain/mechanisms/capabilities/notes set:
--   * vision system (text)
--   * battery / charger inventory (count, chargers, brand, connector)
--   * a preferred auto routine — start position + path, same {x,y} shape as the
--     match-report auto routine, so the dashboard can render it on FieldDiagram
--   * preferred match strategy (score / feed / defend / …) as a jsonb array
--   * robot dimensions + trench capability
--
-- All columns are nullable and additive: existing rows and older clients keep
-- working unchanged (the client only sends the fields it knows about). The
-- anon/authenticated write RLS from 0021 is row-level, so it already covers
-- these new columns.

alter table pit_scouting_report
  add column if not exists vision_system text,
  add column if not exists batteries jsonb,
  add column if not exists preferred_auto_start_position jsonb,
  add column if not exists preferred_auto_path jsonb,
  add column if not exists match_strategy jsonb,
  add column if not exists robot_dimensions jsonb;
