// @vitest-environment node
//
// Grant regression tests for the SECURITY DEFINER RPCs (migration 068).
//
// SECURITY DEFINER functions run as the definer and bypass RLS completely, so
// for them the EXECUTE grant IS the access control. There is no policy behind
// it to catch a mistake. Every one of these also takes the city id as a plain
// argument, so a caller who can execute the function can read ANY tenant's
// data, not just their own.
//
// This suite exists because three of them shipped callable by anon. Verified
// against the live database on 2026-08-30 with the anon key and no session:
// routing_unit_load returned 15 rows of org-unit cost/capacity/depot data, and
// search_document_chunks returned 5 chunks of city contract and policy text.
// Migration 068 revokes them; these tests fail if a future migration (or a
// hand-run GRANT) opens them again.
//
// Every caller in the app is a server module holding the service-role key
// (src/lib/documents/retrieve.ts, src/lib/video/pipeline.ts), so denying anon
// and authenticated costs the product nothing.
//
// GATING, opt-in integration tests, same as the rest of tests/rls:
//
//   SUPABASE_TEST_URL            project URL
//   SUPABASE_TEST_ANON_KEY       anon / publishable key (RLS-enforced)
//   SUPABASE_SERVICE_ROLE_KEY    service-role key (RLS-bypassing)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_DB = Boolean(URL && ANON && SERVICE);

function anonClient(): SupabaseClient {
  return createClient(String(URL), String(ANON), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient(): SupabaseClient {
  return createClient(String(URL), String(SERVICE), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * PostgREST reports a missing EXECUTE grant as "function not found" (PGRST202)
 * rather than a permission error, because an unexecutable function is not
 * exposed in its schema cache at all. Either shape counts as denied; what must
 * never happen is a successful call returning rows.
 */
function isDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42501" ||
    msg.includes("permission denied") ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

let cityId: string;

describe.skipIf(!HAS_DB)("RPC grants: definer functions are service-role only", () => {
  beforeAll(async () => {
    const { data } = await serviceClient()
      .from("cities")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: string }>();
    cityId = data?.id ?? "00000000-0000-0000-0000-000000000000";
  });

  it("anon cannot execute routing_unit_load (org-unit cost, capacity, depots)", async () => {
    const { data, error } = await anonClient().rpc("routing_unit_load", {
      _city_id: cityId,
    });
    expect(isDenied(error)).toBe(true);
    expect(data ?? null).toBeNull();
  });

  it("anon cannot execute search_document_chunks (city contracts + policy text)", async () => {
    const { data, error } = await anonClient().rpc("search_document_chunks", {
      _city_id: cityId,
      _query: "contract",
      _limit: 5,
    });
    expect(isDenied(error)).toBe(true);
    expect(data ?? null).toBeNull();
  });

  it("anon cannot execute find_nearby_detection_cluster (maps live detections)", async () => {
    const { data, error } = await anonClient().rpc(
      "find_nearby_detection_cluster",
      {
        _city_id: cityId,
        _lng: -84.14,
        _lat: 34.2,
        _class: "pothole",
        _radius_m: 500,
      },
    );
    expect(isDenied(error)).toBe(true);
    expect(data ?? null).toBeNull();
  });

  // Control: the pattern the others should have followed all along. If this
  // ever starts passing for anon, the whole suite's premise is broken.
  it("anon cannot execute camera_nearby_clusters (the reference pattern)", async () => {
    const { error } = await anonClient().rpc("camera_nearby_clusters", {
      _city_id: cityId,
      _lng: -84.14,
      _lat: 34.2,
      _radius_m: 500,
      _class: "pothole",
    });
    expect(isDenied(error)).toBe(true);
  });

  // Control: the denials above must be the grant, not a missing function.
  it("service_role can still execute the revoked functions", async () => {
    const { error } = await serviceClient().rpc("routing_unit_load", {
      _city_id: cityId,
    });
    expect(error).toBeNull();
  });
});
