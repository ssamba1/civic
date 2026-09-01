// @vitest-environment node
//
// RLS regression tests for migrations 062 (liability) and 063 (claims).
//
// Spec: docs/planning/CAMERA_LIABILITY_PIPELINE.md §7. "a contractor cannot
// read capital_jobs, cannot read other contractors' claims, cannot read
// report_liability for unassigned reports".
//
// Invariants asserted here:
//
//   1. Anon default-deny on capital_jobs, warranties, utility_permits,
//      report_liability and claims (SELECT filtered/denied, INSERT rejected).
//   2. A signed-in CONTRACTOR cannot read capital_jobs / warranties /
//      utility_permits / report_liability at all, those tables carry no
//      contractor policy by design (peer contract values, warranty exposure).
//   3. A signed-in contractor cannot see a claim in 'draft' state, can see
//      their own claim once it is 'sent', and cannot see another contractor's
//      'sent' claim.
//   4. Service-role control: the same tables are readable with the service key,
//      proving the denials above are RLS and not a missing table.
//
// GATING, opt-in integration tests. The suite still COLLECTS and passes (as
// skipped) unless a live test database is configured:
//
//   SUPABASE_TEST_URL            project URL (e.g. http://127.0.0.1:54321)
//   SUPABASE_TEST_ANON_KEY       anon / publishable key (RLS-enforced)
//   SUPABASE_SERVICE_ROLE_KEY    service-role key (RLS-bypassing; seeds fixtures)
//
// See tests/rls/README.md for the local-run recipe.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_DB = Boolean(URL && ANON && SERVICE);

const RUN = Date.now().toString(36);
const pw = "test-password-9f3!Kq";

// Every table introduced by 062 + 063. Anon must read nothing from any of them.
const LIABILITY_TABLES = [
  "capital_jobs",
  "warranties",
  "utility_permits",
  "report_liability",
  "claims",
] as const;

// The four tables a contractor must never touch (claims is handled separately,
// contractors DO have a scoped policy there).
const CONTRACTOR_FORBIDDEN = [
  "capital_jobs",
  "warranties",
  "utility_permits",
  "report_liability",
] as const;

function serviceClient(): SupabaseClient {
  return createClient(String(URL), String(SERVICE), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient(): SupabaseClient {
  return createClient(String(URL), String(ANON), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Seed = {
  cityId: string;
  reportId: string;
  capitalJobId: string;
  // Contractor A owns the claims; contractor B is the peer who must see nothing.
  contractorAId: string;
  contractorAEmail: string;
  contractorBId: string;
  contractorBEmail: string;
  draftClaimId: string;
  sentClaimId: string;
  peerClaimId: string;
};

let svc: SupabaseClient;
let seed: Seed;

// Register a contractor: an auth account whose email matches a contractors row.
// current_contractor_id() (053) resolves the JWT email → contractors.id, so the
// email must match exactly and the row must be active.
async function makeContractor(
  cityId: string,
  label: string,
): Promise<{ id: string; email: string }> {
  const email = `rls-liab-${label}-${RUN}@example.test`;
  const { error: authErr } = await svc.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
  });
  if (authErr)
    throw new Error(`contractor auth create failed: ${authErr.message}`);

  const { data, error } = await svc
    .from("contractors")
    .insert({
      city_id: cityId,
      name: `RLS ${label} ${RUN}`,
      email,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`contractor insert failed: ${error.message}`);
  return { id: data.id as string, email };
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: pw,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe.skipIf(!HAS_DB)(
  "RLS: liability + claims (migrations 062, 063)",
  () => {
    beforeAll(async () => {
      svc = serviceClient();

      const slug = `rls-liab-${RUN}`;
      const { data: city, error: cityErr } = await svc
        .from("cities")
        .insert({
          slug,
          name: `RLS Liability ${RUN}`,
          state: "GA",
          active: true,
        })
        .select("id")
        .single();
      if (cityErr) throw new Error(`city insert failed: ${cityErr.message}`);
      const cityId = city.id as string;

      const contractorA = await makeContractor(cityId, "a");
      const contractorB = await makeContractor(cityId, "b");

      const { data: report, error: reportErr } = await svc
        .from("reports")
        .insert({
          city_id: cityId,
          location: "SRID=4326;POINT(-84.14 34.20)",
          photo_public_url: "https://example.com/x.webp",
          status: "open",
          source: "resident",
        })
        .select("id")
        .single();
      if (reportErr)
        throw new Error(`report insert failed: ${reportErr.message}`);
      const reportId = report.id as string;

      // A 100m street segment with a live workmanship warranty.
      const { data: job, error: jobErr } = await svc
        .from("capital_jobs")
        .insert({
          city_id: cityId,
          contractor_id: contractorA.id,
          contract_ref: `PO-${RUN}`,
          job_type: "resurfacing",
          footprint: "SRID=4326;LINESTRING(-84.1405 34.1999, -84.1395 34.2001)",
          completed_at: "2025-06-01",
          contract_value_cents: 125_000_00,
          source: "manual",
        })
        .select("id")
        .single();
      if (jobErr)
        throw new Error(`capital_jobs insert failed: ${jobErr.message}`);
      const capitalJobId = job.id as string;

      const { data: warranty, error: warrantyErr } = await svc
        .from("warranties")
        .insert({
          capital_job_id: capitalJobId,
          warranty_type: "workmanship",
          starts_on: "2025-06-01",
          ends_on: "2030-06-01",
        })
        .select("id")
        .single();
      if (warrantyErr)
        throw new Error(`warranties insert failed: ${warrantyErr.message}`);

      const { error: liabErr } = await svc.from("report_liability").insert({
        report_id: reportId,
        verdict: "contractor_warranty",
        capital_job_id: capitalJobId,
        warranty_id: warranty.id,
        liable_contractor_id: contractorA.id,
        window_ends_on: "2030-06-01",
        match_distance_m: 4.2,
        confidence: 0.82,
      });
      if (liabErr)
        throw new Error(`report_liability insert failed: ${liabErr.message}`);

      async function makeClaim(
        contractorId: string,
        state: string,
      ): Promise<string> {
        const { data, error } = await svc
          .from("claims")
          .insert({
            city_id: cityId,
            report_id: reportId,
            liable_contractor_id: contractorId,
            basis: "warranty",
            state,
            packet: { reportId, basis: "warranty", probe: RUN },
            estimated_value_cents: 80_000,
            ...(state === "sent" ? { sent_at: new Date().toISOString() } : {}),
          })
          .select("id")
          .single();
        if (error)
          throw new Error(`claims insert (${state}) failed: ${error.message}`);
        return data.id as string;
      }

      seed = {
        cityId,
        reportId,
        capitalJobId,
        contractorAId: contractorA.id,
        contractorAEmail: contractorA.email,
        contractorBId: contractorB.id,
        contractorBEmail: contractorB.email,
        draftClaimId: await makeClaim(contractorA.id, "draft"),
        sentClaimId: await makeClaim(contractorA.id, "sent"),
        peerClaimId: await makeClaim(contractorB.id, "sent"),
      };
    }, 60_000);

    afterAll(async () => {
      if (!seed) return;
      // reports/capital_jobs cascade from cities; delete the city and the auth
      // users so a persistent test DB does not accumulate fixtures.
      await svc.from("cities").delete().eq("id", seed.cityId);
      const { data } = await svc.auth.admin.listUsers();
      for (const u of data?.users ?? []) {
        if (u.email?.includes(`rls-liab-`) && u.email.includes(RUN)) {
          await svc.auth.admin.deleteUser(u.id);
        }
      }
    }, 60_000);

    describe("anon default-deny", () => {
      it.each(LIABILITY_TABLES)("anon reads no rows from %s", async (table) => {
        const anon = anonClient();
        const { data, error } = await anon.from(table).select("*").limit(5);
        // Denial surfaces either as a permission error or a filtered empty set.
        if (error) {
          expect(error).toBeTruthy();
        } else {
          expect(data ?? []).toHaveLength(0);
        }
      });

      it("anon cannot INSERT a capital job", async () => {
        const anon = anonClient();
        const { error } = await anon.from("capital_jobs").insert({
          city_id: seed.cityId,
          job_type: "resurfacing",
          footprint: "SRID=4326;LINESTRING(-84.14 34.2, -84.139 34.2)",
          completed_at: "2025-01-01",
        });
        expect(error).toBeTruthy();
      });

      it("anon cannot INSERT a claim", async () => {
        const anon = anonClient();
        const { error } = await anon.from("claims").insert({
          city_id: seed.cityId,
          report_id: seed.reportId,
          basis: "warranty",
          state: "draft",
          packet: {},
        });
        expect(error).toBeTruthy();
      });
    });

    describe("contractor scoping", () => {
      let contractor: SupabaseClient;

      beforeAll(async () => {
        contractor = await signIn(seed.contractorAEmail);
      }, 30_000);

      it.each(
        CONTRACTOR_FORBIDDEN,
      )("contractor cannot read %s even for their own job", async (table) => {
        const { data, error } = await contractor
          .from(table)
          .select("*")
          .limit(5);
        if (error) {
          expect(error).toBeTruthy();
        } else {
          expect(data ?? []).toHaveLength(0);
        }
      });

      it("contractor cannot see a DRAFT claim addressed to them", async () => {
        const { data, error } = await contractor
          .from("claims")
          .select("id")
          .eq("id", seed.draftClaimId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });

      it("contractor CAN see their own SENT claim", async () => {
        const { data, error } = await contractor
          .from("claims")
          .select("id, state")
          .eq("id", seed.sentClaimId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(1);
      });

      it("contractor cannot see another contractor's sent claim", async () => {
        const { data, error } = await contractor
          .from("claims")
          .select("id")
          .eq("id", seed.peerClaimId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      });

      it("contractor cannot UPDATE a claim state", async () => {
        const { data, error } = await contractor
          .from("claims")
          .update({ state: "resolved", recovered_value_cents: 0 })
          .eq("id", seed.sentClaimId)
          .select("id");
        // No contractor UPDATE policy: either an explicit error, or zero rows
        // matched because the UPDATE predicate excluded every row.
        if (error) {
          expect(error).toBeTruthy();
        } else {
          expect(data ?? []).toHaveLength(0);
        }
      });
    });

    describe("service-role control", () => {
      it.each(
        LIABILITY_TABLES,
      )("service role queries %s without an RLS error", async (table) => {
        const { error } = await svc.from(table).select("*").limit(1);
        expect(error).toBeNull();
      });
    });
  },
);

// Visible skip signal when no DB is configured, so the suite never reads as
// silently passing with zero assertions.
describe.skipIf(HAS_DB)(
  "RLS: liability suite skipped (no SUPABASE_TEST_URL)",
  () => {
    it("documents that these integration tests need a live test DB", () => {
      expect(HAS_DB).toBe(false);
    });
  },
);
