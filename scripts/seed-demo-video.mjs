// Seed the video-pipeline demo rows for the console's demo clip.
//
// Inserts (idempotently, keyed on the demo feed name) into the live DB:
//   - one "Demo footage" upload feed for the city
//   - one processed clip whose stats are computed from the real detector run
//     (services/detector/detections.json — the same pass rendered into
//     public/demo/civic-demo-clip.mp4)
//   - candidate detection clusters derived from that run
//
// Requires migration 20260824_056_video_pipeline.sql to be applied.
// Usage: node scripts/seed-demo-video.mjs [city-slug]   (default: cumming)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const slug = process.argv[2] ?? "cumming";
const FEED_NAME = "Demo footage";
// Cumming, GA center — clusters are spread a few hundred meters along a pass.
const CENTER = { lng: -84.14, lat: 34.21 };

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(method, path, body) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── derive clip stats + clusters from the real detector run ────────────────
const det = JSON.parse(
  readFileSync(join(root, "services", "detector", "detections.json"), "utf8"),
);
const frames = det.frames ?? [];
const withBoxes = frames.filter((f) => f.boxes.length > 0);
const totalBoxes = frames.reduce((s, f) => s + f.boxes.length, 0);
const maxConf = Math.max(
  0,
  ...frames.flatMap((f) => f.boxes.map((b) => b.conf)),
);
const durationS = frames.length / (det.fps || 25);

// Three canned clusters shaped from the run: strongest pothole track plus two
// weaker surface tracks, offset along the pass direction.
const clusters = [
  {
    klass: "pothole",
    conf: Math.round(maxConf * 100) / 100,
    frameCount: Math.min(withBoxes.length, 24),
    dLng: 0,
    dLat: 0,
  },
  {
    klass: "alligator_crack",
    conf: 0.62,
    frameCount: 9,
    dLng: 0.0012,
    dLat: 0.0004,
  },
  {
    klass: "debris",
    conf: 0.48,
    frameCount: 5,
    dLng: 0.0021,
    dLat: 0.0009,
  },
];

// ── seed ───────────────────────────────────────────────────────────────────
const [city] = await rest("GET", `cities?slug=eq.${slug}&select=id,name`);
if (!city) {
  console.error(`No cities row for slug "${slug}"`);
  process.exit(1);
}

const existing = await rest(
  "GET",
  `video_feeds?city_id=eq.${city.id}&name=eq.${encodeURIComponent(FEED_NAME)}&select=id`,
);
if (existing.length > 0) {
  console.log(`Demo feed already seeded for ${city.name} — nothing to do.`);
  process.exit(0);
}

const [feed] = await rest("POST", "video_feeds", {
  city_id: city.id,
  kind: "upload",
  name: FEED_NAME,
});

const [clip] = await rest("POST", "video_clips", {
  feed_id: feed.id,
  city_id: city.id,
  storage_path: `${city.id}/demo-sample.mp4`,
  duration_s: Math.round(durationS * 10) / 10,
  captured_at: new Date().toISOString(),
  start_location: `SRID=4326;POINT(${CENTER.lng} ${CENTER.lat})`,
  status: "done",
  frames_sampled: frames.length,
  detections_found: totalBoxes,
  detector_version: "demo-canned",
});

for (const c of clusters) {
  await rest("POST", "detection_clusters", {
    city_id: city.id,
    location: `SRID=4326;POINT(${CENTER.lng + c.dLng} ${CENTER.lat + c.dLat})`,
    class: c.klass,
    max_confidence: c.conf,
    frame_count: c.frameCount,
    status: "candidate",
  });
}

console.log(
  `Seeded ${city.name}: feed ${feed.id}, clip ${clip.id} (${frames.length} frames, ${totalBoxes} detections), ${clusters.length} clusters.`,
);
