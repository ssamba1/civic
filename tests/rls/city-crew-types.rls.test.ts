// @vitest-environment node
//
// RLS regression tests for migration 031 (city_crew_types). Same opt-in
// integration harness as rls.test.ts: RUN_RLS_TESTS=1 + keys from .env.local.
//
// Policy under test: crew type descriptions are internal operational config, so
// like crews (030) this table is staff-only — anonymous callers must never read
// or write it.
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
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_ENV = OPTED_IN && Boolean(URL && ANON && SERVICE);

// The service-role control assumes migration 031 is applied to the target DB.
// Gate it (mirrors CHECK_MIGRATION_030 in crews.rls.test.ts) so a pending
// migration doesn't read as a test regression; the anon-deny tests hold either
// way — a missing table also denies.
const CHECK_031 = HAS_ENV && process.env.CHECK_MIGRATION_031 === "1";

const TABLES = ["city_crew_types"] as const;

describe.skipIf(!HAS_ENV)(
  "RLS: city_crew_types are staff-only (migration 031)",
  () => {
    let anon: SupabaseClient;

    beforeAll(() => {
      anon = createClient(String(URL), String(ANON), {
        auth: { persistSession: false },
      });
    });

    it.each(TABLES)("anon cannot read any rows from %s", async (table) => {
      const { data, error } = await anon.from(table).select("*").limit(5);
      // Denial surfaces as a permission error or a silently filtered empty set.
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it("anon cannot INSERT a city_crew_type", async () => {
      const { error } = await anon.from("city_crew_types").insert({
        city_id: "00000000-0000-0000-0000-000000000000",
        name: "rls_probe",
        description: "x",
      });
      expect(error).toBeTruthy();
    });
  },
);

describe.skipIf(!CHECK_031)(
  "RLS: city_crew_types service-role control (031 applied)",
  () => {
    let service: SupabaseClient;

    beforeAll(() => {
      service = createClient(String(URL), String(SERVICE), {
        auth: { persistSession: false },
      });
    });

    it.each(
      TABLES,
    )("service role can query %s without an RLS error", async (table) => {
      // Proves the anon denials above are RLS, not a missing table.
      const { error } = await service.from(table).select("*").limit(1);
      expect(error).toBeNull();
    });
  },
);
