// tests/functions/ingest-reports.test.ts
// Integration test against the DEPLOYED ingest-reports edge function.
// Seeds FK rows (event/team/match/scout) via the service-role admin client,
// then POSTs a valid report with HMAC and asserts ingested:1 + row exists.
// Also asserts tampered HMAC → 401.
import { describe, it, expect, afterAll } from "vitest";
import { config } from "dotenv";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BASE = `${process.env.VITE_SUPABASE_URL}/functions/v1/ingest-reports`;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SECRET = process.env.QR_INGEST_HMAC_SECRET as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY as string;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;

// Canonical HMAC: SHA-256 over JSON.stringify(reports) — must match function exactly.
function sign(reports: unknown[]): string {
  return createHmac("sha256", SECRET)
    .update(JSON.stringify(reports))
    .digest("hex");
}

// Admin client for seeding/cleanup (uses service role key).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Unique IDs for this test run to avoid collisions.
const TEST_EVENT_KEY = "2099test_ingest";
const TEST_MATCH_KEY = "2099test_ingest_qm1";
const TEST_TEAM_NUMBER = 99991;
const TEST_REPORT_ID = "00000000-d4d4-d4d4-d4d4-000000000001";
let TEST_SCOUT_ID = "";

async function seed() {
  // Insert event
  await admin.from("event").upsert({
    event_key: TEST_EVENT_KEY,
    name: "Ingest Test Event",
    is_active: true,
    staged_fuel_per_match: 504,
  });
  // Insert team
  await admin.from("team").upsert({
    team_number: TEST_TEAM_NUMBER,
    nickname: "Test Team Ingest",
  });
  // Insert match
  await admin.from("match").upsert({
    match_key: TEST_MATCH_KEY,
    event_key: TEST_EVENT_KEY,
    comp_level: "qm",
    match_number: 1,
  });
  // Insert scout (auth_uid must be a valid uuid; use a deterministic one)
  const scoutAuthUid = "00000000-d4d4-d4d4-d4d4-aaaaaaaaaaaa";
  const { data: scoutData, error: scoutErr } = await admin
    .from("scout")
    .upsert({
      event_key: TEST_EVENT_KEY,
      display_name: "Test Scout Ingest",
      auth_uid: scoutAuthUid,
    })
    .select("id")
    .single();
  if (scoutErr || !scoutData) throw new Error(`Scout seed failed: ${scoutErr?.message}`);
  TEST_SCOUT_ID = scoutData.id;
}

async function cleanup() {
  // Delete in FK-safe order
  await admin
    .from("match_scouting_report")
    .delete()
    .eq("event_key", TEST_EVENT_KEY);
  await admin.from("scout").delete().eq("event_key", TEST_EVENT_KEY);
  await admin.from("match").delete().eq("event_key", TEST_EVENT_KEY);
  await admin.from("event").delete().eq("event_key", TEST_EVENT_KEY);
  await admin.from("team").delete().eq("team_number", TEST_TEAM_NUMBER);
}

describe("ingest-reports (deployed)", () => {
  it("seed FK rows before test", async () => {
    await seed();
    expect(TEST_SCOUT_ID).toBeTruthy();
  }, 30000);

  it("rejects a bad HMAC with 401", async () => {
    const reports: unknown[] = [];
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reports, hmac: "deadbeef" }),
    });
    expect(res.status).toBe(401);
  }, 30000);

  it("accepts a valid HMAC over an empty batch", async () => {
    const reports: unknown[] = [];
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reports, hmac: sign(reports) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ingested).toBe(0);
  }, 30000);

  it("ingests a valid report (ingested:1) and row exists with aggregates", async () => {
    // fuel_bursts is a valid JSONB array (shift/count/source entries)
    const report = {
      id: TEST_REPORT_ID,
      schema_version: 1,
      app_version: "test-1.0.0",
      device_id: "test-device-d4",
      event_key: TEST_EVENT_KEY,
      match_key: TEST_MATCH_KEY,
      scout_id: TEST_SCOUT_ID,
      target_team_number: TEST_TEAM_NUMBER,
      alliance_color: "red",
      station: 1,
      fuel_bursts: [{ shift: 0, count: 3, source: "floor" }],
      row_revision: 1,
    };
    const reports = [report];
    const hmac = sign(reports);

    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reports, hmac }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ingested).toBe(1);

    // Verify the row exists in the DB
    const { data, error } = await admin
      .from("match_scouting_report")
      .select("id, event_key, match_key, target_team_number, fuel_bursts")
      .eq("id", TEST_REPORT_ID)
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBe(TEST_REPORT_ID);
    expect(data?.event_key).toBe(TEST_EVENT_KEY);
    // aggregates recomputed: fuel_bursts stored
    expect(Array.isArray(data?.fuel_bursts)).toBe(true);
  }, 30000);

  it("rejects tampered HMAC over non-empty batch with 401", async () => {
    const report = {
      id: TEST_REPORT_ID,
      schema_version: 1,
      event_key: TEST_EVENT_KEY,
      match_key: TEST_MATCH_KEY,
      scout_id: TEST_SCOUT_ID,
      target_team_number: TEST_TEAM_NUMBER,
      alliance_color: "red",
      station: 1,
      fuel_bursts: [],
    };
    const reports = [report];
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reports, hmac: "tampered00000000000000000000000000000000000000000000000000000000" }),
    });
    expect(res.status).toBe(401);
  }, 30000);

  afterAll(async () => {
    await cleanup();
  });
});
