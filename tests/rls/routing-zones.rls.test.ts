// @vitest-environment node
//
// RLS regression tests for migration 033 (routing_zones + resolve_zone_team).
// Same opt-in harness as the other rls tests: RUN_RLS_TESTS=1 + keys from
// .env.local.
//
// Policy under test: routing_zones has PUBLIC read (routing config is not
// sensitive; mirrors sla_targets/city_teams) but staff-only write scoped to the
// caller's city. Anonymous callers may SELECT but must never INSERT/UPDATE.
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
const CHECK_033 = HAS_ENV && process.env.CHECK_MIGRATION_033 === "1";

const NIL = "00000000-0000-0000-0000-000000000000";

describe.skipIf(!HAS_ENV)(
  "RLS: routing_zones public-read, staff-write (migration 033)",
  () => {
    let anon: SupabaseClient;

    beforeAll(() => {
      anon = createClient(String(URL), String(ANON), {
        auth: { persistSession: false },
      });
    });

    it.skipIf(!CHECK_033)(
      "anon CAN read routing_zones (public config)",
      async () => {
        const { error } = await anon
          .from("routing_zones")
          .select("id")
          .limit(1);
        expect(error).toBeNull();
      },
    );

    it("anon cannot INSERT a routing zone (staff-scoped write)", async () => {
      const { error } = await anon.from("routing_zones").insert({
        city_id: NIL,
        name: "rls probe zone",
        team_key: "streets_roads",
        boundary: "SRID=4326;MULTIPOLYGON(((0 0,0 1,1 1,1 0,0 0)))",
      });
      expect(error).toBeTruthy();
    });
  },
);

describe.skipIf(!CHECK_033)(
  "RLS: routing_zones service-role control (033 applied)",
  () => {
    let service: SupabaseClient;

    beforeAll(() => {
      service = createClient(String(URL), String(SERVICE), {
        auth: { persistSession: false },
      });
    });

    it("service role can query routing_zones without an RLS error", async () => {
      const { error } = await service
        .from("routing_zones")
        .select("*")
        .limit(1);
      expect(error).toBeNull();
    });

    it("resolve_zone_team RPC exists and returns null for an unknown report", async () => {
      const { data, error } = await service.rpc("resolve_zone_team", {
        _report_id: NIL,
      });
      expect(error).toBeNull();
      expect(data ?? null).toBeNull();
    });
  },
);
