// @vitest-environment node
//
// RLS regression tests for migration 042 (org_units). Same opt-in integration
// harness as rls.test.ts: RUN_RLS_TESTS=1 + keys from .env.local.
//
// Policy under test: org_units expose org structure AND contractor pricing, so
// like crews (030) they are staff-only. Anonymous callers must never read or
// write them.
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
    // No .env.local, rely on the process environment.
  }
}
const OPTED_IN = process.env.RUN_RLS_TESTS === "1";
if (OPTED_IN) loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_ENV = OPTED_IN && Boolean(URL && ANON && SERVICE);

// Service-role control assumes migration 042 is applied. Gate it (mirrors
// CHECK_MIGRATION_030) so a pending migration doesn't read as a regression;
// the anon-deny tests hold either way. A missing table also denies.
const CHECK_042 = HAS_ENV && process.env.CHECK_MIGRATION_042 === "1";

describe.skipIf(!HAS_ENV)(
  "RLS: org_units are staff-only (migration 042)",
  () => {
    let anon: SupabaseClient;

    beforeAll(() => {
      anon = createClient(String(URL), String(ANON), {
        auth: { persistSession: false },
      });
    });

    it("anon cannot read any rows from org_units", async () => {
      const { data, error } = await anon.from("org_units").select("*").limit(5);
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it("anon cannot read contractor pricing", async () => {
      const { data, error } = await anon
        .from("org_units")
        .select("cost_per_job, capacity")
        .limit(5);
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it("anon cannot INSERT an org unit", async () => {
      const { error } = await anon.from("org_units").insert({
        city_id: "00000000-0000-0000-0000-000000000000",
        kind: "team",
        key: "rls_probe_team",
        label: "rls-probe",
      });
      expect(error).toBeTruthy();
    });
  },
);

describe.skipIf(!CHECK_042)(
  "RLS: org_units service-role control (042 applied)",
  () => {
    let service: SupabaseClient;

    beforeAll(() => {
      service = createClient(String(URL), String(SERVICE), {
        auth: { persistSession: false },
      });
    });

    it("service role can query org_units without an RLS error", async () => {
      // Proves the anon denials above are RLS, not a missing table.
      const { error } = await service.from("org_units").select("*").limit(1);
      expect(error).toBeNull();
    });
  },
);
