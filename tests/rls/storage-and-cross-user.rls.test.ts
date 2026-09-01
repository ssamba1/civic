// @vitest-environment node
//
// RLS regression tests, NET-NEW invariants (task T1.15).
//
// This file DELIBERATELY does not re-cover anon default-deny or the
// service-role bypass control: those already live in `tests/rls/rls.test.ts`
// (opt-in behind RUN_RLS_TESTS=1). Duplicating them is explicitly out of scope.
// Here we assert the two invariants that were previously untested:
//
//   1. Cross-user isolation. An authenticated resident cannot read another
//      resident's report row via the RLS-enforced anon/authenticated client
//      (reports_select_own scopes SELECT to reporter_id = auth.uid()).
//
//   2. Storage cross-folder INSERT (the T1.13 gap). An authenticated user in
//      city A must NOT be able to upload an object into city B's folder in the
//      photos-public / photos-raw buckets.
//
//      ⚠️  KNOWN FAILURE AGAINST THE CURRENT SCHEMA. Migration
//      `20260527_003_storage_rls_and_fixes.sql` grants INSERT with only
//      `WITH CHECK (bucket_id = '<bucket>')`. It does not constrain the object
//      path to the uploader's city. So this test is expected to FAIL until a
//      migration tightens the policy to also check
//      `(storage.foldername(name))[1] = <caller's city id>`. That red is the
//      point: it is the regression guard for T1.13, not a bug in the test.
//
// GATING. These are opt-in integration tests. They stay in skip mode (the
// suite still COLLECTS and passes) unless a live test database is configured:
//
//   SUPABASE_TEST_URL            project URL (e.g. http://127.0.0.1:54321 from `supabase start`)
//   SUPABASE_TEST_ANON_KEY       anon / publishable key (RLS-enforced)
//   SUPABASE_SERVICE_ROLE_KEY    service-role key (RLS-bypassing; provisions fixtures)
//
// See tests/rls/README.md for the full local-run recipe.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_DB = Boolean(URL && ANON && SERVICE);

// Unique suffix so repeated runs against a persistent DB don't collide.
const RUN = Date.now().toString(36);
const pw = "test-password-9f3!Kq";

type Fixture = {
  city: string; // city_id (uuid)
  slug: string;
  userId: string; // auth + public.users id (uuid)
  email: string;
};

// Service-role client (bypasses RLS). Used only to build fixtures and clean up.
function serviceClient(): SupabaseClient {
  return createClient(String(URL), String(SERVICE), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// A fresh anon-key client. persistSession:false keeps concurrent signed-in
// sessions isolated (each returned client carries its own auth state).
function anonClient(): SupabaseClient {
  return createClient(String(URL), String(ANON), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Create a city + an auth user + the matching public.users row (city-scoped).
// The public.users row is MANDATORY: current_user_city_id()/is_staff() read
// from public.users, and there is no handle_new_user trigger in the migrations,
// so without this insert every city-scoped policy would evaluate against a NULL
// city and the tests would pass for the wrong reason.
async function makeFixture(
  svc: SupabaseClient,
  label: string,
  role: "resident" | "staff_dispatcher" = "resident",
): Promise<Fixture> {
  const slug = `rls-${label}-${RUN}`;
  const { data: cityRows, error: cityErr } = await svc
    .from("cities")
    .insert({ slug, name: `RLS ${label} ${RUN}`, state: "GA", active: true })
    .select("id")
    .single();
  if (cityErr) throw new Error(`city insert failed: ${cityErr.message}`);
  const city = cityRows.id as string;

  const email = `rls-${label}-${RUN}@example.test`;
  const { data: created, error: userErr } = await svc.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
  });
  if (userErr || !created.user) {
    throw new Error(`auth user create failed: ${userErr?.message}`);
  }
  const userId = created.user.id;

  const { error: profileErr } = await svc
    .from("users")
    .insert({ id: userId, city_id: city, role, email });
  if (profileErr) {
    throw new Error(`public.users insert failed: ${profileErr.message}`);
  }

  return { city, slug, userId, email };
}

// Sign a fixture in and return an RLS-enforced client bound to that user's JWT.
async function signIn(f: Fixture): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: f.email,
    password: pw,
  });
  if (error) throw new Error(`sign-in failed for ${f.email}: ${error.message}`);
  return client;
}

// Insert a report owned by `owner` in the owner's city (service role bypasses
// RLS so we can seed regardless of policy). Returns the new report id.
async function seedReport(
  svc: SupabaseClient,
  owner: Fixture,
): Promise<string> {
  const { data, error } = await svc
    .from("reports")
    .insert({
      city_id: owner.city,
      reporter_id: owner.userId,
      location: "SRID=4326;POINT(-84.14 34.20)",
      photo_public_url: "https://example.com/x.webp",
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw new Error(`seed report failed: ${error.message}`);
  return data.id as string;
}

describe.skipIf(!HAS_DB)("RLS: cross-user + storage folder isolation", () => {
  let svc: SupabaseClient;
  let alice: Fixture; // city A resident
  let bob: Fixture; // city B resident
  let aliceReportId: string;

  beforeAll(async () => {
    svc = serviceClient();
    alice = await makeFixture(svc, "alice");
    bob = await makeFixture(svc, "bob");
    aliceReportId = await seedReport(svc, alice);
  }, 30_000);

  afterAll(async () => {
    if (!HAS_DB) return;
    // Best-effort teardown. Order matters: reports FK-reference users+cities.
    try {
      await svc.from("reports").delete().eq("reporter_id", alice.userId);
      await svc.from("reports").delete().eq("reporter_id", bob.userId);
      await svc.from("users").delete().in("id", [alice.userId, bob.userId]);
      await svc.auth.admin.deleteUser(alice.userId);
      await svc.auth.admin.deleteUser(bob.userId);
      await svc.from("cities").delete().in("slug", [alice.slug, bob.slug]);
    } catch {
      // Leave fixtures behind rather than fail the run on cleanup.
    }
  }, 30_000);

  // --- 1. Cross-user report read isolation --------------------------------
  it("owner CAN read their own report (sanity: policy isn't blanket-deny)", async () => {
    const client = await signIn(alice);
    const { data, error } = await client
      .from("reports")
      .select("id")
      .eq("id", aliceReportId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("a resident CANNOT read another resident's report (reports_select_own)", async () => {
    const client = await signIn(bob);
    const { data, error } = await client
      .from("reports")
      .select("*")
      .eq("id", aliceReportId);
    // RLS scopes SELECT to reporter_id = auth.uid(); Bob is not the owner and
    // not staff in Alice's city, so he must see zero rows (RLS filters silently
    // rather than erroring on SELECT).
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("a resident CANNOT insert a report into another user's city", async () => {
    const client = await signIn(bob);
    // reports_insert_resident WITH CHECK requires city_id = current_user_city_id()
    // AND reporter_id = auth.uid(). Bob targeting Alice's city must be rejected.
    const { error } = await client.from("reports").insert({
      city_id: alice.city,
      reporter_id: bob.userId,
      location: "SRID=4326;POINT(-84.14 34.20)",
      photo_public_url: "https://example.com/x.webp",
      status: "open",
    });
    expect(error).toBeTruthy();
  });

  // --- 2. Storage cross-folder INSERT (T1.13) -----------------------------
  // Convention under test: objects are namespaced by city as the first path
  // segment, i.e. "<city_id>/<report_id>/<file>". A city-A user uploading into
  // a city-B-prefixed path must be denied.
  it("authed user in city A CANNOT upload into city B's public folder (T1.13)", async () => {
    const client = await signIn(alice);
    const path = `${bob.city}/${RUN}-cross.webp`; // Alice writing into Bob's city folder
    const { error } = await client.storage
      .from("photos-public")
      .upload(path, new Blob([new Uint8Array([1, 2, 3])]), {
        contentType: "image/webp",
        upsert: false,
      });
    // EXPECTED TO FAIL until the storage INSERT policy constrains the path to
    // the uploader's city (see file header). A non-error here is the T1.13
    // vulnerability, not a passing test.
    expect(
      error,
      "storage INSERT into a foreign city folder must be denied (T1.13)",
    ).toBeTruthy();

    // Defensive cleanup if the upload wrongly succeeded, so a leaked object
    // doesn't poison a persistent DB.
    if (!error) {
      await svc.storage.from("photos-public").remove([path]);
    }
  });

  it("authed user CAN upload into their OWN city folder (control)", async () => {
    const client = await signIn(alice);
    const path = `${alice.city}/${RUN}-own.webp`;
    const { error } = await client.storage
      .from("photos-public")
      .upload(path, new Blob([new Uint8Array([1, 2, 3])]), {
        contentType: "image/webp",
        upsert: true,
      });
    expect(error).toBeNull();
    await svc.storage.from("photos-public").remove([path]);
  });
});

// Visible skip signal when no DB is configured (mirrors rls.test.ts) so the
// suite never reads as silently passing with zero assertions.
describe.skipIf(HAS_DB)(
  "RLS: cross-user + storage suite skipped (no SUPABASE_TEST_URL)",
  () => {
    it("documents that these integration tests need a live test DB", () => {
      expect(HAS_DB).toBe(false);
    });
  },
);
