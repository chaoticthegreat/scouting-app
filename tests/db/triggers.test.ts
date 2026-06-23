import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const URL = process.env.VITE_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
let admin: SupabaseClient;

const EVENT = 'TESTC2evt';
const TEAM = 999001;
const MATCH = 'TESTC2evt_qm1';
let scoutId = '';
let reportId = '';

beforeAll(async () => {
  admin = createClient(URL, SECRET, { auth: { persistSession: false } });
  await admin.from('event').upsert({ event_key: EVENT, name: 'C2 Test', is_active: true });
  await admin.from('team').upsert({ team_number: TEAM, nickname: 'C2' });
  await admin.from('match').upsert({ match_key: MATCH, event_key: EVENT, comp_level: 'qm', match_number: 1 });
  const { data: s } = await admin.from('scout')
    .upsert({ event_key: EVENT, display_name: 'C2 scout', auth_uid: crypto.randomUUID() }, { onConflict: 'auth_uid' })
    .select().single();
  scoutId = s!.id;
});

afterAll(async () => {
  if (reportId) await admin.from('match_scouting_report').delete().eq('id', reportId);
  await admin.from('scout').delete().eq('id', scoutId);
  await admin.from('match').delete().eq('match_key', MATCH);
  await admin.from('event_team').delete().eq('event_key', EVENT);
  await admin.from('team').delete().eq('team_number', TEAM);
  await admin.from('event').delete().eq('event_key', EVENT);
});

it('recompute mirrors TS fuel-by-window math; inactiveFirst parity + boundary + rounding', async () => {
  // inactive_first = true => shift1,shift3 inactive; shift2,shift4 active.
  // Bursts (window labels are advisory; recompute classifies by startMs):
  //  auto: 20s @ rate 1.0     -> 20 fuel (active)
  //  transition: 10s @ 0.5    -> 5 fuel (active)
  //  shift1 (inactive): 25s @ 2 -> 50 fuel (NOT counted in points; in teleop_fuel_inactive)
  //  shift2 (active): 25s @ 2 -> 50 fuel
  //  burst straddling 1:45 endgame boundary: start 105000 end 115000 @ 1.0 -> 10 fuel; startMs=105000 is shift4 (active)
  //  rounding: 3s @ 0.5 = 1.5 -> rounds half-up to 2 (its own window)
  const bursts = [
    { startMs: 0, endMs: 20000, rate: 1.0, window: 'auto' },
    { startMs: 0, endMs: 10000, rate: 0.5, window: 'transition' },
    { startMs: 10000, endMs: 35000, rate: 2.0, window: 'shift1' },
    { startMs: 35000, endMs: 60000, rate: 2.0, window: 'shift2' },
    { startMs: 105000, endMs: 115000, rate: 1.0, window: 'shift4' },
    { startMs: 60000, endMs: 63000, rate: 0.5, window: 'shift3' },
  ];
  const { data: r, error: insErr } = await admin.from('match_scouting_report').insert({
    schema_version: 1, event_key: EVENT, match_key: MATCH, scout_id: scoutId,
    target_team_number: TEAM, alliance_color: 'red', station: 1,
    inactive_first: true, fuel_bursts: bursts,
  }).select().single();
  expect(insErr, insErr?.message).toBeNull();
  reportId = r!.id;

  const { error: rcErr } = await admin.rpc('recompute_match_report_aggregates', { p_report_id: reportId });
  expect(rcErr, rcErr?.message).toBeNull();

  const { data: out } = await admin.from('match_scouting_report')
    .select('auto_fuel,teleop_fuel_active,teleop_fuel_inactive,endgame_fuel,fuel_by_shift,fuel_points')
    .eq('id', reportId).single();

  // auto burst classified to auto window only.
  expect(out!.auto_fuel).toBe(20);
  // fuel_by_shift indexes 0..3 = shift1..shift4 rounded per window.
  // shift1: 25s*2=50 ; shift2: 25s*2=50 ; shift3: 3s*0.5=1.5 -> 2 ; shift4: burst start 105000 -> window shift4, 10s*1=10
  expect(out!.fuel_by_shift).toEqual([50, 50, 2, 10]);
  // endgame_fuel: no burst with startMs>=110000 -> 0
  expect(out!.endgame_fuel).toBe(0);
  // teleop_fuel_active = transition(5) + active shifts(shift2=50, shift4=10) = 65
  expect(out!.teleop_fuel_active).toBe(65);
  // teleop_fuel_inactive = inactive shifts shift1(50)+shift3(2) = 52
  expect(out!.teleop_fuel_inactive).toBe(52);
  // fuel_points = active windows: auto(20)+transition(5)+endgame(0)+shift2(50)+shift4(10) = 85, *1
  expect(out!.fuel_points).toBe(85);
});

it('BEFORE UPDATE bumps row_revision and updated_at', async () => {
  const before = await admin.from('match_scouting_report')
    .select('row_revision,updated_at').eq('id', reportId).single();
  await admin.from('match_scouting_report').update({ notes: 'touch' }).eq('id', reportId);
  const after = await admin.from('match_scouting_report')
    .select('row_revision,updated_at').eq('id', reportId).single();
  expect(after.data!.row_revision).toBe(before.data!.row_revision + 1);
  expect(new Date(after.data!.updated_at).getTime())
    .toBeGreaterThanOrEqual(new Date(before.data!.updated_at).getTime());
});
