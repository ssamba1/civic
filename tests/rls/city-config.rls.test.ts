// @vitest-environment node
//
// RLS regression tests for migration 024 (city_config): city_departments,
// category_routing, sla_targets (public read / staff write) and cost_rules,
// provision_jobs (staff-only read / staff write). Same opt-in harness as the
// other rls tests: RUN_RLS_TESTS=1 + keys from .env.local; the service-role
// control is additionally gated on CHECK_MIGRATION_024=1 so a pending migration
// doesn't read as a regression.
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
const CHECK_024 = HAS_ENV && process.env.CHECK_MIGRATION_024 === "1";

const NIL = "00000000-0000-0000-0000-000000000000";
const PUBLIC_READ = [
  "city_departments",
  "category_routing",
  "sla_targets",
] as const;
const STAFF_ONLY_READ = ["cost_rules", "provision_jobs"] as const;
const ALL_TABLES = [...PUBLIC_READ, ...STAFF_ONLY_READ] as const;

describe.skipIf(!HAS_ENV)("RLS 024: anonymous access", () => {
  let anon: SupabaseClient;
  beforeAll(() => {
    anon = createClient(String(URL), String(ANON), {
      auth: { persistSession: false },
    });
  });

  it.skipIf(!CHECK_024).each(PUBLIC_READ)(
    "anon CAN read %s (public config)",
    async (table) => {
      const { error } = await anon.from(table).select("*").limit(1);
      expect(error).toBeNull();
    },
  );

  it.each(
    STAFF_ONLY_READ,
  )("anon CANNOT read %s (staff-scoped)", async (table) => {
    const { data, error } = await anon.from(table).select("*").limit(5);
    if (error) expect(error).toBeTruthy();
    else expect(data ?? []).toHaveLength(0);
  });

  it.each(
    ALL_TABLES,
  )("anon cannot write %s (staff-scoped write)", async (table) => {
    const { error } = await anon
      .from(table)
      .insert({ city_id: NIL, category: "pothole" });
    expect(error).toBeTruthy();
  });
});

describe.skipIf(!CHECK_024)(
  "RLS 024: service-role control (proves denials are RLS, not missing tables)",
  () => {
    let service: SupabaseClient;
    beforeAll(() => {
      service = createClient(String(URL), String(SERVICE), {
        auth: { persistSession: false },
      });
    });

    it.each(
      ALL_TABLES,
    )("service role can query %s without an RLS error", async (table) => {
      const { error } = await service.from(table).select("*").limit(1);
      expect(error).toBeNull();
    });
  },
);

describe.skipIf(HAS_ENV)("RLS 024: skipped (no Supabase env)", () => {
  it("documents that these integration tests need live credentials", () => {
    expect(HAS_ENV).toBe(false);
  });
});
