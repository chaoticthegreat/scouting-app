// tests/functions/tba-proxy.test.ts
import { describe, it, expect } from "vitest";
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = `${process.env.VITE_SUPABASE_URL}/functions/v1/tba-proxy`;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

describe("tba-proxy (deployed)", () => {
  it("returns the real name for event 2026casnv", async () => {
    const res = await fetch(`${BASE}?path=/event/2026casnv`, {
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.name).toBe("string");
    expect(body.key).toBe("2026casnv");
  }, 30000);

  it("rejects a missing path with 400", async () => {
    const res = await fetch(BASE, {
      headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
    });
    expect(res.status).toBe(400);
  }, 30000);
});
