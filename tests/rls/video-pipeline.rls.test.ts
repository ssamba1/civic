// @vitest-environment node
//
// RLS regression tests for migration 056 (video pipeline). Same opt-in
// integration harness as rls.test.ts: RUN_RLS_TESTS=1 + keys from .env.local.
//
// Policy under test: camera positions, GPS tracks, and unblurred-frame paths
// are operationally sensitive. Every video table is staff-only within the
// staff member's own city. Anonymous callers must never read or write any of
// them, and detections/clusters accept NO authenticated writes at all
// (pipeline writes go through the service role).
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

const VIDEO_TABLES = [
  "video_feeds",
  "video_clips",
  "damage_detections",
  "detection_clusters",
] as const;

describe.skipIf(!HAS_ENV)(
  "RLS: video pipeline tables are staff-only (migration 056)",
  () => {
    let anon: SupabaseClient;

    beforeAll(() => {
      anon = createClient(String(URL), String(ANON), {
        auth: { persistSession: false },
      });
    });

    it.each(VIDEO_TABLES)("anon cannot read any rows from %s", async (table) => {
      const { data, error } = await anon.from(table).select("*").limit(5);
      // Denial surfaces as a permission error or a silently filtered empty set.
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });

    it("anon cannot INSERT a video feed", async () => {
      const { error } = await anon.from("video_feeds").insert({
        city_id: "00000000-0000-0000-0000-000000000000",
        kind: "upload",
        name: "rls-probe",
      });
      expect(error).toBeTruthy();
    });

    it("anon cannot INSERT a detection cluster (pipeline-only writes)", async () => {
      const { error } = await anon.from("detection_clusters").insert({
        city_id: "00000000-0000-0000-0000-000000000000",
        class: "pothole",
      });
      expect(error).toBeTruthy();
    });

    it("anon cannot read the private video-frames bucket", async () => {
      const { data, error } = await anon.storage
        .from("video-frames")
        .list("", { limit: 1 });
      if (error) {
        expect(error).toBeTruthy();
      } else {
        expect(data ?? []).toHaveLength(0);
      }
    });
  },
);
