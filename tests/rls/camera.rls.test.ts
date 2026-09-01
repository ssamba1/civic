// @vitest-environment node
//
// RLS regression tests for migration 064 (camera ingest).
//
// Spec: docs/planning/CAMERA_LIABILITY_PIPELINE.md §4.2/§4.4 + §7.
//
// The invariant that matters most here is the INGEST one. There is deliberately
// no anon/authenticated INSERT policy on detections or detection_clusters:
// frames are written by POST /api/camera/frames with the SERVICE ROLE after an
// api_keys check. If someone ever adds an INSERT policy "so the client can post
// directly", a leaked anon key becomes the ability to forge detections at
// arbitrary coordinates and, through cluster promotion, forge reports and
// liability claims. These tests are the guard on that.
//
// Also asserted: contractors cannot enumerate camera devices or detections (a
// vendor must not learn where the city's cameras have been looking), and the
// service-role control proves the denials are RLS rather than a missing table.
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

const CAMERA_TABLES = [
  "camera_devices",
  "detection_clusters",
  "detections",
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
  deviceId: string;
  clusterId: string;
  contractorEmail: string;
};

let svc: SupabaseClient;
let seed: Seed;

describe.skipIf(!HAS_DB)("RLS: camera ingest (migration 064)", () => {
  beforeAll(async () => {
    svc = serviceClient();

    const slug = `rls-cam-${RUN}`;
    const { data: city, error: cityErr } = await svc
      .from("cities")
      .insert({ slug, name: `RLS Camera ${RUN}`, state: "GA", active: true })
      .select("id")
      .single();
    if (cityErr) throw new Error(`city insert failed: ${cityErr.message}`);
    const cityId = city.id as string;

    // Contractor fixture: auth account whose email matches a contractors row,
    // which is what current_contractor_id() (053) resolves against.
    const contractorEmail = `rls-cam-vendor-${RUN}@example.test`;
    const { error: authErr } = await svc.auth.admin.createUser({
      email: contractorEmail,
      password: pw,
      email_confirm: true,
    });
    if (authErr)
      throw new Error(`contractor auth create failed: ${authErr.message}`);
    const { error: vendorErr } = await svc.from("contractors").insert({
      city_id: cityId,
      name: `RLS Camera Vendor ${RUN}`,
      email: contractorEmail,
      active: true,
    });
    if (vendorErr)
      throw new Error(`contractor insert failed: ${vendorErr.message}`);

    const { data: device, error: deviceErr } = await svc
      .from("camera_devices")
      .insert({
        city_id: cityId,
        label: `RLS bus ${RUN}`,
        vehicle_ref: `BUS-${RUN}`,
        kind: "vehicle",
        active: true,
      })
      .select("id")
      .single();
    if (deviceErr)
      throw new Error(`camera_devices insert failed: ${deviceErr.message}`);
    const deviceId = device.id as string;

    const { data: cluster, error: clusterErr } = await svc
      .from("detection_clusters")
      .insert({
        city_id: cityId,
        centroid: "SRID=4326;POINT(-84.14 34.20)",
        damage_class: "pothole",
        observation_count: 2,
        peak_score: 0.71,
        state: "observing",
      })
      .select("id")
      .single();
    if (clusterErr) {
      throw new Error(
        `detection_clusters insert failed: ${clusterErr.message}`,
      );
    }
    const clusterId = cluster.id as string;

    const { error: detErr } = await svc.from("detections").insert({
      device_id: deviceId,
      city_id: cityId,
      frame_external_id: `frame-${RUN}-1`,
      captured_at: new Date().toISOString(),
      location: "SRID=4326;POINT(-84.14 34.20)",
      damage_class: "pothole",
      score: 0.71,
      crop_url: "https://example.com/blurred-crop.webp",
      cluster_id: clusterId,
    });
    if (detErr) throw new Error(`detections insert failed: ${detErr.message}`);

    seed = { cityId, deviceId, clusterId, contractorEmail };
  }, 60_000);

  afterAll(async () => {
    if (!seed) return;
    await svc.from("cities").delete().eq("id", seed.cityId);
    const { data } = await svc.auth.admin.listUsers();
    for (const u of data?.users ?? []) {
      if (u.email?.includes("rls-cam-") && u.email.includes(RUN)) {
        await svc.auth.admin.deleteUser(u.id);
      }
    }
  }, 60_000);

  describe("anon default-deny", () => {
    it.each(CAMERA_TABLES)("anon reads no rows from %s", async (table) => {
      const anon = anonClient();
      const { data, error } = await anon.from(table).select("*").limit(5);
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it("anon cannot register a camera device", async () => {
      const anon = anonClient();
      const { error } = await anon.from("camera_devices").insert({
        city_id: seed.cityId,
        label: "rls-probe-device",
        kind: "vehicle",
      });
      expect(error).toBeTruthy();
    });

    // The ingest invariant. A forged detection at a chosen coordinate is a
    // forged report and, downstream, a forged liability claim.
    it("anon cannot INSERT a detection (ingest is service-role only)", async () => {
      const anon = anonClient();
      const { error } = await anon.from("detections").insert({
        device_id: seed.deviceId,
        city_id: seed.cityId,
        frame_external_id: `forged-${RUN}`,
        captured_at: new Date().toISOString(),
        location: "SRID=4326;POINT(-84.14 34.20)",
        damage_class: "pothole",
        score: 0.99,
        crop_url: "https://example.com/forged.webp",
      });
      expect(error).toBeTruthy();
    });

    it("anon cannot INSERT a detection cluster", async () => {
      const anon = anonClient();
      const { error } = await anon.from("detection_clusters").insert({
        city_id: seed.cityId,
        centroid: "SRID=4326;POINT(-84.14 34.20)",
        damage_class: "pothole",
      });
      expect(error).toBeTruthy();
    });

    it("anon cannot promote a cluster by UPDATE", async () => {
      const anon = anonClient();
      const { data, error } = await anon
        .from("detection_clusters")
        .update({ state: "promoted" })
        .eq("id", seed.clusterId)
        .select("id");
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });
  });

  describe("contractor scoping", () => {
    let contractor: SupabaseClient;

    beforeAll(async () => {
      contractor = anonClient();
      const { error } = await contractor.auth.signInWithPassword({
        email: seed.contractorEmail,
        password: pw,
      });
      if (error) throw new Error(`contractor sign-in failed: ${error.message}`);
    }, 30_000);

    it.each(
      CAMERA_TABLES,
    )("contractor reads no rows from %s", async (table) => {
      const { data, error } = await contractor.from(table).select("*").limit(5);
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });
  });

  describe("service-role control", () => {
    it.each(
      CAMERA_TABLES,
    )("service role queries %s without an RLS error", async (table) => {
      const { error } = await svc.from(table).select("*").limit(1);
      expect(error).toBeNull();
    });

    it("service role sees the seeded detection (proves anon denial is RLS)", async () => {
      const { data, error } = await svc
        .from("detections")
        .select("id")
        .eq("frame_external_id", `frame-${RUN}-1`);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(1);
    });
  });
});

// Visible skip signal when no DB is configured.
describe.skipIf(HAS_DB)(
  "RLS: camera suite skipped (no SUPABASE_TEST_URL)",
  () => {
    it("documents that these integration tests need a live test DB", () => {
      expect(HAS_DB).toBe(false);
    });
  },
);
