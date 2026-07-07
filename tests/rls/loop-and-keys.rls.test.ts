// @vitest-environment node
//
// RLS regression tests for the migration 025–028 tables (agents.md hard rule
// #3): report_updates, report_csat (025), report_upvotes, issue_types (027),
// api_keys (028). Same opt-in model as rls.test.ts — hermetic `pnpm test`
// skips these; run with `pnpm test:rls` against a DB that has 025–028 applied.
//
// Existence-dependent assertions (service-role control reads, RPC grants) are
// additionally gated on CHECK_MIGRATIONS_025_028=1 — mirroring the CHECK_012
// precedent — so this file doesn't read as a regression against a database
// where the migrations are still pending.
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
const CHECK_APPLIED =
  HAS_ENV && process.env.CHECK_MIGRATIONS_025_028 === "1";

// Sessionless-anon must never read rows from these. report_updates/report_csat
// scope SELECT to the reporter/staff; report_upvotes to the owner; api_keys has
// no client policy at all (service-role only).
const ANON_DENIED_TABLES = [
  "report_updates",
  "report_csat",
  "report_upvotes",
  "api_keys",
] as const;

const NIL = "00000000-0000-0000-0000-000000000000";

describe.skipIf(!HAS_ENV)("RLS 025–028: anonymous access", () => {
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
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("anon cannot INSERT a report_updates row (writes are service-role only)", async () => {
    const { error } = await anon.from("report_updates").insert({
      report_id: NIL,
      status: "closed",
      actor: "staff",
    });
    expect(error).toBeTruthy();
  });

  it("anon cannot INSERT a report_csat row (writes are service-role only)", async () => {
    const { error } = await anon
      .from("report_csat")
      .insert({ report_id: NIL, rating: "up" });
    expect(error).toBeTruthy();
  });

  it("sessionless anon cannot INSERT an upvote (WITH CHECK user_id = auth.uid())", async () => {
    const { error } = await anon
      .from("report_upvotes")
      .insert({ report_id: NIL, user_id: NIL });
    expect(error).toBeTruthy();
  });

  it("anon cannot INSERT an api_key (no client policy at all)", async () => {
    const { error } = await anon.from("api_keys").insert({
      key_hash: "deadbeef",
      label: "should never work",
      user_id: NIL,
    });
    expect(error).toBeTruthy();
  });

  it.skipIf(!CHECK_APPLIED)(
    "anon CAN read issue_types (public routing/display config)",
    async () => {
      const { error } = await anon.from("issue_types").select("key").limit(1);
      expect(error).toBeNull();
    },
  );

  it("anon cannot write issue_types (staff-scoped policy)", async () => {
    const { error } = await anon.from("issue_types").insert({
      city_id: NIL,
      key: "custom_should_fail",
      label: "nope",
      team_key: "general_admin",
    });
    expect(error).toBeTruthy();
  });

  it.skipIf(!CHECK_APPLIED)(
    "anon CAN call report_upvote_counts (aggregate RPC; no user ids exposed)",
    async () => {
      const { data, error } = await anon.rpc("report_upvote_counts", {
        _report_ids: [NIL],
      });
      expect(error).toBeNull();
      // Shape check: rows (if any) carry only report_id + count.
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual(["report_id", "upvotes"]);
      }
    },
  );
});

describe.skipIf(!CHECK_APPLIED)(
  "RLS 025–028: service role control (proves denials above are RLS)",
  () => {
    let service: SupabaseClient;

    beforeAll(() => {
      service = createClient(String(URL), String(SERVICE), {
        auth: { persistSession: false },
      });
    });

    it.each([
      "report_updates",
      "report_csat",
      "report_upvotes",
      "issue_types",
      "api_keys",
    ] as const)("service role can query %s without an RLS error", async (table) => {
      const { error } = await service.from(table).select("*").limit(1);
      expect(error).toBeNull();
    });
  },
);

describe.skipIf(HAS_ENV)("RLS 025–028: skipped (no Supabase env)", () => {
  it("documents that these integration tests need live credentials", () => {
    expect(HAS_ENV).toBe(false);
  });
});
