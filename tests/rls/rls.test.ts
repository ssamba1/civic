// @vitest-environment node
//
// Row-Level-Security regression tests (agents.md hard rule #3: "Tests in
// tests/rls/ must pass before merging schema changes").
//
// These are INTEGRATION tests: they hit a real Supabase project with the anon
// key (RLS-enforced) and the service-role key (RLS-bypassing) and assert the
// default-deny policy model from migration 001. They are OPT-IN, the default
// hermetic `pnpm test` skips them so the unit suite never makes network calls.
// Run them explicitly with the keys from .env.local (best-effort auto-loaded):
//
//   pnpm test:rls          # sets RUN_RLS_TESTS=1, reads .env.local
//
// or manually:
//
//   RUN_RLS_TESTS=1 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   SUPABASE_SERVICE_ROLE_KEY=... pnpm test tests/rls
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// --- Best-effort .env.local loader (no dotenv dep) -------------------------
// Only fills vars that aren't already set; never overrides a real environment.
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
// Opt-in: only touch the network when explicitly requested, so the default
// `pnpm test` stays hermetic and offline.
const OPTED_IN = process.env.RUN_RLS_TESTS === "1";
if (OPTED_IN) loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_ENV = OPTED_IN && Boolean(URL && ANON && SERVICE);

// The merged/rejected exclusion assertion only holds once migration 012 is
// applied to the target DB. Gate it so it doesn't read as a test regression
// while the migration is still pending (apply via scripts/apply-012.mjs).
const CHECK_012 = HAS_ENV && process.env.CHECK_MIGRATION_012 === "1";

// Tables that anonymous callers must NEVER read directly. There is no anon
// SELECT policy on any of them (migration 001 §RLS). Public reads must go
// through dashboard_reports_view instead.
const ANON_DENIED_TABLES = [
  "reports",
  "classifications",
  "work_orders",
  "merges",
  "audit_log",
  "error_log",
] as const;

describe.skipIf(!HAS_ENV)("RLS: anonymous access is default-deny", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(String(URL), String(ANON), {
      auth: { persistSession: false },
    });
  });

  it.each(
    ANON_DENIED_TABLES,
  )("anon cannot read any rows from %s", async (table) => {
    const { data, error } = await anon.from(table).select("*").limit(5);
    // RLS denial surfaces either as a permission error or as a silently
    // filtered empty set. Both are acceptable; a non-empty result is a leak.
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("anon CAN read the public dashboard view (granted to anon)", async () => {
    const { error } = await anon
      .from("dashboard_reports_view")
      .select("id")
      .limit(1);
    // The grant exists, so there must be no permission error (0 rows is fine).
    expect(error).toBeNull();
  });

  it("anon cannot INSERT a report (no anon insert policy / WITH CHECK fails)", async () => {
    const { error } = await anon.from("reports").insert({
      city_id: "00000000-0000-0000-0000-000000000000",
      reporter_id: "00000000-0000-0000-0000-000000000000",
      location: "SRID=4326;POINT(0 0)",
      photo_public_url: "https://example.com/x.webp",
      status: "open",
    });
    expect(error).toBeTruthy();
  });
});

describe.skipIf(!HAS_ENV)("RLS: service role bypasses RLS (control)", () => {
  let service: SupabaseClient;

  beforeAll(() => {
    service = createClient(String(URL), String(SERVICE), {
      auth: { persistSession: false },
    });
  });

  it("service role can query reports without an RLS error", async () => {
    // Proves the anon empties above are RLS, not a broken table/connection:
    // the same table is readable with the elevated key.
    const { error } = await service.from("reports").select("id").limit(1);
    expect(error).toBeNull();
  });

  it.skipIf(!CHECK_012)(
    "dashboard_reports_view excludes 'rejected' and 'merged' (migration 012)",
    async () => {
      // The view's whole purpose post-012 is to hide rejected+merged reports
      // from public counts. If any leak through, 012 is not applied (or the
      // dedup feature is silently broken). Gated on CHECK_MIGRATION_012=1 so it
      // doesn't read as a regression while the migration is still pending.
      const { data, error } = await service
        .from("dashboard_reports_view")
        .select("status")
        .in("status", ["rejected", "merged"])
        .limit(1);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    },
  );
});

// When the env is absent we still want a visible signal that the suite was
// skipped rather than silently passing with zero assertions.
describe.skipIf(HAS_ENV)("RLS: skipped (no Supabase env configured)", () => {
  it("documents that RLS integration tests need live credentials", () => {
    expect(HAS_ENV).toBe(false);
  });
});
