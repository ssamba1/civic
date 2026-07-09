// @vitest-environment node
//
// RLS / RPC regression tests for migration 034 (cross-jurisdiction routing).
// Opt-in harness: RUN_RLS_TESTS=1 + keys from .env.local; RPC-existence
// assertions gated on CHECK_MIGRATION_034=1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) {
        process.env[k] = v.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .env.local — rely on the process environment.
  }
}
const OPTED_IN = process.env.RUN_RLS_TESTS === "1";
if (OPTED_IN) loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_ENV = OPTED_IN && Boolean(URL && SERVICE);
const CHECK_034 = HAS_ENV && process.env.CHECK_MIGRATION_034 === "1";
const NIL = "00000000-0000-0000-0000-000000000000";

describe.skipIf(!CHECK_034)(
  "migration 034: resolve_report_jurisdiction RPC",
  () => {
    let service: SupabaseClient;
    beforeAll(() => {
      service = createClient(String(URL), String(SERVICE), {
        auth: { persistSession: false },
      });
    });

    it("exists and returns null for an unknown report", async () => {
      const { data, error } = await service.rpc("resolve_report_jurisdiction", {
        _report_id: NIL,
      });
      expect(error).toBeNull();
      expect(data ?? null).toBeNull();
    });

    it("work_orders exposes owner_city_id (service-role select)", async () => {
      const { error } = await service
        .from("work_orders")
        .select("owner_city_id")
        .limit(1);
      expect(error).toBeNull();
    });
  },
);

describe.skipIf(HAS_ENV)("migration 034: skipped (no Supabase env)", () => {
  it("documents that these integration tests need live credentials", () => {
    expect(HAS_ENV).toBe(false);
  });
});
