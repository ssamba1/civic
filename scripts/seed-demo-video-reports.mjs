// Carry the seeded demo detection clusters through to dispatched reports.
//
// scripts/seed-demo-video.mjs stops at 'candidate' clusters. This script does
// what src/lib/video/decide.ts does on a 'dispatch' decision, without the
// Gemini call, so the console demo shows the whole chain: clip → detections →
// clusters → real reports that look like resident submissions.
//
// For each of the three demo clusters it:
//   - extracts the strongest evidence frame from services/detector/sample_video.mp4
//   - uploads it to the private 'video-frames' bucket
//   - inserts a damage_detections row and points the cluster at it
//   - inserts a reports row (+ its classifications row) with the frame landed
//     in the private 'photos-raw' bucket at {city_id}/{report_id}.jpg
//   - flips the cluster to dispatched/dispatch with the report attached
//
// Hard rule 2: the unblurred camera frame NEVER enters photos-public, the
// public row carries the static placeholder, same as decide.ts.
//
// Idempotent: exits early once the demo clusters already carry report_id.
// Usage: node scripts/seed-demo-video-reports.mjs [city-slug]   (default: cumming)

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
// Same center + offsets seed-demo-video.mjs used, so report locations line up
// with the cluster points (the DB returns those as WKB, never decode them).
const CENTER = { lng: -84.14, lat: 34.21 };
const FRAMES_BUCKET = "video-frames";
const RAW_BUCKET = "photos-raw";
// Mirrors VIDEO_PLACEHOLDER_PUBLIC_PATH in src/lib/video/decide.ts.
const VIDEO_PLACEHOLDER_PUBLIC_PATH = "/video-detection-placeholder.svg";

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
  if (!r.ok)
    throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function ensureBucket(name) {
  const r = await fetch(`${url}/storage/v1/bucket/${name}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (r.ok) return;
  if (r.status !== 404) throw new Error(`bucket ${name} -> ${r.status}`);
  const c = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, id: name, public: false }),
  });
  if (!c.ok) throw new Error(`create bucket ${name} -> ${c.status}`);
  console.log(`Created private bucket ${name}.`);
}

async function upload(bucket, path, bytes) {
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "image/jpeg",
      // Tolerate a half-finished earlier run rather than 400 on a stale object.
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!r.ok)
    throw new Error(
      `upload ${bucket}/${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`,
    );
}

// ── evidence frames ────────────────────────────────────────────────────────
const det = JSON.parse(
  readFileSync(join(root, "services", "detector", "detections.json"), "utf8"),
);
const fps = det.fps || 25;
const byFrame = new Map(det.frames.map((f) => [f.i, f]));

/** Strongest box on a frame. */
function bestBox(i) {
  const boxes = byFrame.get(i)?.boxes ?? [];
  return boxes.reduce((a, b) => (b.conf > (a?.conf ?? 0) ? b : a), null);
}

const scratch = join(tmpdir(), "civic-demo-frames");
mkdirSync(scratch, { recursive: true });

function extractFrame(i) {
  const out = join(scratch, `frame-${i}.jpg`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(i / fps),
      "-i",
      join(root, "services", "detector", "sample_video.mp4"),
      "-frames:v",
      "1",
      "-q:v",
      "2",
      out,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0)
    throw new Error(`ffmpeg frame ${i} failed: ${(r.stderr ?? "").slice(-300)}`);
  return readFileSync(out);
}

// ── per-cluster demo content ───────────────────────────────────────────────
// Frame picks: the three strongest boxes in the run that sit far enough apart
// to be visibly different scenes (262 is the peak of the pothole track).
const PLAN = {
  pothole: {
    frame: 262,
    category: "pothole",
    severity: 4,
    address: "1245 Peachtree Industrial Blvd, Cumming, GA 30041",
    description:
      "Deep pothole in the right wheel track on Peachtree Industrial Blvd, grows after every rain, cars swerve into the next lane to miss it.",
    rationale:
      "High-confidence pothole tracked across 24 frames on an arterial. Dispatch for repair.",
    subcategory: "asphalt pothole in travel lane",
  },
  alligator_crack: {
    frame: 42,
    category: "sidewalk_damage",
    severity: 3,
    address: "310 Canton Hwy, Cumming, GA 30040",
    description:
      "The pavement outside 310 Canton Hwy has cracked into a web of squares. It has been spreading all summer and the edge is starting to crumble where people step off the curb.",
    rationale:
      "Alligator cracking over a sustained stretch. Surface failure, dispatch for assessment.",
    subcategory: "alligator cracking / surface fatigue",
  },
  debris: {
    frame: 316,
    category: "debris",
    severity: 2,
    address: "525 Buford Hwy, Cumming, GA 30041",
    description:
      "There's a pile of broken-up asphalt and a chunk of bumper sitting in the shoulder near 525 Buford Hwy. Cyclists have to pull out into traffic to get around it.",
    rationale:
      "Loose debris in the shoulder blocking the bike route. Dispatch for pickup.",
    subcategory: "roadway debris in shoulder",
  },
};

const OFFSETS = {
  pothole: { dLng: 0, dLat: 0 },
  alligator_crack: { dLng: 0.0012, dLat: 0.0004 },
  debris: { dLng: 0.0021, dLat: 0.0009 },
};

// ── seed ───────────────────────────────────────────────────────────────────
const [city] = await rest("GET", `cities?slug=eq.${slug}&select=id,name`);
if (!city) {
  console.error(`No cities row for slug "${slug}"`);
  process.exit(1);
}

const clusters = await rest(
  "GET",
  `video_detection_clusters?city_id=eq.${city.id}&class=in.(pothole,alligator_crack,debris)&select=id,class,max_confidence,frame_count,report_id&order=created_at.asc`,
);
if (clusters.length === 0) {
  console.error("No demo clusters, run scripts/seed-demo-video.mjs first.");
  process.exit(1);
}
if (clusters.every((c) => c.report_id)) {
  console.log(
    `Demo clusters already dispatched for ${city.name}. Nothing to do.`,
  );
  process.exit(0);
}

const [clip] = await rest(
  "GET",
  `video_clips?city_id=eq.${city.id}&storage_path=like.*demo-sample.mp4&select=id,created_by`,
);
if (!clip) {
  console.error("No demo clip, run scripts/seed-demo-video.mjs first.");
  process.exit(1);
}

// reports.reporter_id is NOT NULL. The demo clip has no created_by, so the
// reports are attributed to the seeded demo resident instead.
const [reporter] =
  (await rest(
    "GET",
    "users?email=eq.resident@civic-test.local&select=id&limit=1",
  )) ?? [];
if (!reporter) {
  console.error("No resident@civic-test.local user to attribute reports to.");
  process.exit(1);
}

await ensureBucket(FRAMES_BUCKET);
await ensureBucket(RAW_BUCKET);

const seeded = [];
for (const cluster of clusters) {
  if (cluster.report_id) continue;
  const plan = PLAN[cluster.class];
  const offset = OFFSETS[cluster.class];
  if (!plan || !offset) continue;

  const point = `SRID=4326;POINT(${CENTER.lng + offset.dLng} ${CENTER.lat + offset.dLat})`;
  const jpg = extractFrame(plan.frame);

  const framePath = `${city.id}/demo/frame-${plan.frame}.jpg`;
  await upload(FRAMES_BUCKET, framePath, jpg);

  const [detection] = await rest("POST", "damage_detections", {
    clip_id: clip.id,
    city_id: city.id,
    frame_ts_s: Math.round((plan.frame / fps) * 100) / 100,
    frame_path: framePath,
    location: point,
    class: cluster.class,
    // Keep the evidence frame's confidence consistent with the cluster it
    // represents. A best detection stronger than its cluster reads as a bug.
    confidence: cluster.max_confidence,
    bbox: bestBox(plan.frame),
    cluster_id: cluster.id,
  });

  const reportId = crypto.randomUUID();
  // The classify pipeline reads photos-raw at `${city_id}/${report_id}.jpg`.
  const rawPath = `${city.id}/${reportId}.jpg`;
  await upload(RAW_BUCKET, rawPath, jpg);

  await rest("POST", "reports", {
    id: reportId,
    city_id: city.id,
    reporter_id: reporter.id,
    location: point,
    // Unblurred camera frame stays private; the public row carries the static
    // placeholder (hard rule 2, no raw photo in the public bucket).
    photo_public_url: VIDEO_PLACEHOLDER_PUBLIC_PATH,
    photo_raw_url: `${RAW_BUCKET}/${rawPath}`,
    address: plan.address,
    description: plan.description,
    tags: ["video-detection"],
    status: "open",
    classify_status: "done",
  });

  // Category + severity live on classifications, not on reports.
  await rest("POST", "classifications", {
    report_id: reportId,
    category: plan.category,
    subcategory: plan.subcategory,
    severity: plan.severity,
    confidence: cluster.max_confidence,
    reasoning: plan.rationale,
    is_emergency: false,
    model_version: "demo-canned",
  });

  const now = new Date().toISOString();
  await rest("PATCH", `video_detection_clusters?id=eq.${cluster.id}`, {
    best_detection_id: detection.id,
    status: "dispatched",
    decision: "dispatch",
    decision_rationale: plan.rationale,
    report_id: reportId,
    decided_at: now,
    updated_at: now,
  });

  seeded.push({
    class: cluster.class,
    frame: plan.frame,
    detection: detection.id,
    report: reportId,
  });
}

for (const s of seeded) {
  console.log(
    `${s.class}: frame ${s.frame} → detection ${s.detection} → report ${s.report}`,
  );
}
console.log(`Dispatched ${seeded.length} demo cluster(s) for ${city.name}.`);
