// Rebuild the demo clip's detection clusters from the REAL detector output.
//
// scripts/seed-demo-video.mjs seeded three hand-picked clusters, so the
// console showed 3 detections for a clip that visibly contains ~20 pieces of
// road damage. This script throws those away and derives clusters from
// services/detector/detections.json instead:
//
//   1. track boxes across frames (IoU + centroid, small gap tolerance) so the
//      same pothole drifting toward the camera becomes ONE cluster
//   2. keep tracks with real evidence (>= MIN_FRAMES frames, peak conf >= MIN_PEAK_CONF)
//   3. per surviving track: ffmpeg-extract its peak frame, upload to the
//      private 'video-frames' bucket, insert a damage_detections row, point
//      the cluster at it
//   4. label by box geometry (the detector output carries no class)
//   5. place each cluster along a short road-shaped path by frame timestamp
//   6. escalate the confident ones (peak conf >= ESCALATE_CONF) into real
//      reports exactly like scripts/seed-demo-video-reports.mjs does
//
// Idempotent: every cluster this script writes carries the
// decision_dossier.seed marker below, and the previous run's clusters,
// detections, reports and classifications are deleted first. All deletes are
// scoped to the demo clip / the demo feed's city. Non-demo data is untouched.
//
// Hard rule 2 holds: the unblurred frame goes to the private photos-raw
// bucket only; the public row carries the static placeholder.
//
// Usage: node scripts/seed-demo-video-clusters.mjs [city-slug]   (default: cumming)

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

// ── tuning ────────────────────────────────────────────────────────────────
/** Boxes on adjacent frames join a track at this IoU... */
const TRACK_MIN_IOU = 0.3;
/** ...or when their centres are this close in normalized frame coords. */
const TRACK_MAX_CENTROID = 0.08;
/** A track survives this many frames without a match before it closes. */
const TRACK_MAX_GAP = 5;
/** Evidence floor for a track to become a cluster. */
const MIN_FRAMES = 3;
const MIN_PEAK_CONF = 0.45;
/** Only confident clusters escalate to a report; the rest stay 'candidate'. */
const ESCALATE_CONF = 0.6;

/** Marker written into decision_dossier so re-runs can find our own rows. */
const SEED_MARKER = "demo-video-clusters";

const FRAMES_BUCKET = "video-frames";
const RAW_BUCKET = "photos-raw";
/** Mirrors VIDEO_PLACEHOLDER_PUBLIC_PATH in src/lib/video/decide.ts. */
const VIDEO_PLACEHOLDER_PUBLIC_PATH = "/video-detection-placeholder.svg";

// Short road-shaped path through Cumming, GA, a slight dogleg rather than a
// straight line so clusters land at visibly distinct points on the map.
const ROAD = [
  { t: 0, lng: -84.1452, lat: 34.2076 },
  { t: 5, lng: -84.1418, lat: 34.2094 },
  { t: 10, lng: -84.1381, lat: 34.2107 },
  { t: 15, lng: -84.1352, lat: 34.2133 },
];

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
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!r.ok)
    throw new Error(
      `upload ${bucket}/${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`,
    );
}

// ── tracking ───────────────────────────────────────────────────────────────
// src/lib/video/cluster.ts groups detections by geography or frame aHash; raw
// detector boxes have neither, so grouping here is image-space across time.
// That tracker does not exist in the repo, hence the local implementation.

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function centroidDistance(a, b) {
  return Math.hypot(
    a.x + a.w / 2 - (b.x + b.w / 2),
    a.y + a.h / 2 - (b.y + b.h / 2),
  );
}

/** Greedy frame-to-frame association; returns closed tracks. */
function trackBoxes(frames) {
  let open = [];
  const closed = [];
  for (const frame of frames) {
    const claimed = new Set();
    for (const box of frame.boxes) {
      let best = null;
      let bestScore = -1;
      for (const track of open) {
        if (claimed.has(track)) continue;
        const last = track.boxes[track.boxes.length - 1].box;
        const score = iou(last, box);
        const matches =
          score >= TRACK_MIN_IOU ||
          centroidDistance(last, box) <= TRACK_MAX_CENTROID;
        if (matches && score > bestScore) {
          bestScore = score;
          best = track;
        }
      }
      if (best) {
        best.boxes.push({ i: frame.i, box });
        best.lastFrame = frame.i;
        claimed.add(best);
      } else {
        open.push({ boxes: [{ i: frame.i, box }], lastFrame: frame.i });
      }
    }
    open = open.filter((t) => {
      if (frame.i - t.lastFrame > TRACK_MAX_GAP) {
        closed.push(t);
        return false;
      }
      return true;
    });
  }
  closed.push(...open);
  return closed;
}

/**
 * Class from box geometry, the detector head emits no label, so assign
 * deterministically over the RDD2022 vocabulary in src/lib/video/config.ts:
 *   area >= 0.08          → alligator_crack  (large fatigued surface patch)
 *   aspect >= 2.0         → transverse_crack (wide and short, across the lane)
 *   aspect <= 0.6         → longitudinal_crack (tall and narrow, along the lane)
 *   otherwise             → pothole          (compact / roughly square)
 */
function classifyBox(box) {
  const area = box.w * box.h;
  const aspect = box.h > 0 ? box.w / box.h : 1;
  if (area >= 0.08) return "alligator_crack";
  if (aspect >= 2.0) return "transverse_crack";
  if (aspect <= 0.6) return "longitudinal_crack";
  return "pothole";
}

/**
 * Location at `t` seconds along ROAD. Linear interpolation between the
 * bracketing waypoints, clamped to the ends, mirrors interpolateTrack() in
 * src/lib/video/track.ts (that module is TS and read-only, so the logic is
 * reproduced rather than imported).
 */
function interpolateTrack(track, t) {
  if (track.length === 0) return null;
  if (t <= track[0].t) return { lng: track[0].lng, lat: track[0].lat };
  const last = track[track.length - 1];
  if (t >= last.t) return { lng: last.lng, lat: last.lat };
  for (let i = 1; i < track.length; i++) {
    if (t <= track[i].t) {
      const a = track[i - 1];
      const b = track[i];
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      return {
        lng: a.lng + (b.lng - a.lng) * f,
        lat: a.lat + (b.lat - a.lat) * f,
      };
    }
  }
  return { lng: last.lng, lat: last.lat };
}

// ── report copy (deterministic, per class) ─────────────────────────────────
const STREETS = [
  "Peachtree Industrial Blvd",
  "Canton Hwy",
  "Buford Hwy",
  "Atlanta Rd",
  "Tribble Gap Rd",
  "Pilgrim Mill Rd",
  "Bald Ridge Marina Rd",
  "Dahlonega Hwy",
  "Kelly Mill Rd",
  "Sawnee Dr",
];

const CLASS_COPY = {
  pothole: {
    category: "pothole",
    severity: (conf) => (conf >= 0.8 ? 4 : 3),
    subcategory: "asphalt pothole in travel lane",
    description: (street) =>
      `Deep pothole in the right wheel track on ${street}. It gets worse after every rain and cars swing into the next lane to miss it.`,
    rationale: "Compact high-confidence road void tracked across the pass",
  },
  alligator_crack: {
    category: "sidewalk_damage",
    severity: () => 3,
    subcategory: "alligator cracking / surface fatigue",
    description: (street) =>
      `The pavement along ${street} has cracked into a web of squares. It has been spreading all summer and the edge is starting to crumble.`,
    rationale: "Large fatigued surface patch, spreading pavement failure",
  },
  transverse_crack: {
    category: "pothole",
    severity: () => 2,
    subcategory: "transverse crack across travel lane",
    description: (street) =>
      `A crack runs straight across both lanes of ${street}. It has opened up enough that you feel it in the steering wheel at speed.`,
    rationale: "Wide transverse crack spanning the lane",
  },
  longitudinal_crack: {
    category: "pothole",
    severity: () => 2,
    subcategory: "longitudinal crack along travel lane",
    description: (street) =>
      `There is a long split running with the lane line on ${street}. Water is standing in it and the edges are starting to break away.`,
    rationale: "Longitudinal crack tracking with the lane",
  },
};

// ── derive clusters ────────────────────────────────────────────────────────
const det = JSON.parse(
  readFileSync(join(root, "services", "detector", "detections.json"), "utf8"),
);
const fps = det.fps || 25;
const tracks = trackBoxes(det.frames ?? []);
const kept = tracks
  .filter(
    (t) =>
      t.boxes.length >= MIN_FRAMES &&
      Math.max(...t.boxes.map((b) => b.box.conf)) >= MIN_PEAK_CONF,
  )
  .map((t) => {
    const peak = t.boxes.reduce((a, b) => (b.box.conf > a.box.conf ? b : a));
    return {
      frameCount: t.boxes.length,
      peakFrame: peak.i,
      bbox: peak.box,
      conf: peak.box.conf,
      class: classifyBox(peak.box),
    };
  })
  .sort((a, b) => a.peakFrame - b.peakFrame);

console.log(
  `Tracked ${tracks.length} raw tracks → ${kept.length} clusters ` +
    `(>=${MIN_FRAMES} frames, peak conf >=${MIN_PEAK_CONF}); ` +
    `${kept.filter((k) => k.conf >= ESCALATE_CONF).length} escalate to reports.`,
);

// ── look up the demo rows ──────────────────────────────────────────────────
const [city] = await rest("GET", `cities?slug=eq.${slug}&select=id,name`);
if (!city) {
  console.error(`No cities row for slug "${slug}"`);
  process.exit(1);
}

const [clip] = await rest(
  "GET",
  `video_clips?city_id=eq.${city.id}&storage_path=like.*demo-sample.mp4&select=id`,
);
if (!clip) {
  console.error("No demo clip, run scripts/seed-demo-video.mjs first.");
  process.exit(1);
}

const [reporter] =
  (await rest(
    "GET",
    "users?email=eq.resident@civic-test.local&select=id&limit=1",
  )) ?? [];
if (!reporter) {
  console.error("No resident@civic-test.local user to attribute reports to.");
  process.exit(1);
}

// ── clean out the previous demo seed ───────────────────────────────────────
// Three sources, all scoped to the demo clip / demo city:
//   a) clusters referenced by any detection on the demo clip
//   b) clusters carrying this script's own seed marker
//   c) the three canned clusters from seed-demo-video.mjs that never got a
//      detection (class + exact frame_count + no best_detection_id)
const clusterIds = new Set();

const oldDetections = await rest(
  "GET",
  `damage_detections?clip_id=eq.${clip.id}&select=id,cluster_id`,
);
for (const d of oldDetections) if (d.cluster_id) clusterIds.add(d.cluster_id);

const marked = await rest(
  "GET",
  `video_detection_clusters?city_id=eq.${city.id}&decision_dossier->>seed=eq.${SEED_MARKER}&select=id`,
);
for (const c of marked) clusterIds.add(c.id);

const CANNED = [
  { class: "pothole", frame_count: 24 },
  { class: "alligator_crack", frame_count: 9 },
  { class: "debris", frame_count: 5 },
];
for (const sig of CANNED) {
  const rows = await rest(
    "GET",
    `video_detection_clusters?city_id=eq.${city.id}&class=eq.${sig.class}` +
      `&frame_count=eq.${sig.frame_count}&best_detection_id=is.null&select=id`,
  );
  for (const r of rows) clusterIds.add(r.id);
}

if (clusterIds.size > 0) {
  const idList = [...clusterIds].join(",");
  const stale = await rest(
    "GET",
    `video_detection_clusters?id=in.(${idList})&select=id,report_id`,
  );
  const reportIds = stale.map((c) => c.report_id).filter(Boolean);
  if (reportIds.length > 0) {
    const rl = reportIds.join(",");
    await rest("DELETE", `classifications?report_id=in.(${rl})`);
    // cluster.report_id is ON DELETE SET NULL, so the cluster rows survive
    // long enough to be deleted below.
    await rest("DELETE", `reports?id=in.(${rl})`);
  }
  await rest("DELETE", `damage_detections?clip_id=eq.${clip.id}`);
  await rest("DELETE", `video_detection_clusters?id=in.(${idList})`);
  console.log(
    `Cleared ${clusterIds.size} previous cluster(s), ${oldDetections.length} detection(s), ${reportIds.length} report(s).`,
  );
}

// ── frame extraction ───────────────────────────────────────────────────────
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

await ensureBucket(FRAMES_BUCKET);
await ensureBucket(RAW_BUCKET);

// ── insert ─────────────────────────────────────────────────────────────────
let escalated = 0;
for (const [idx, k] of kept.entries()) {
  const tsS = Math.round((k.peakFrame / fps) * 100) / 100;
  const at = interpolateTrack(ROAD, tsS);
  // Two tracks can peak on the same frame; offset each laterally by where its
  // box sits across the frame (left shoulder → right shoulder, ~±8 m) so
  // co-timed clusters land on opposite sides of the road instead of stacking.
  const lateral = (k.bbox.x + k.bbox.w / 2 - 0.5) * 0.00016;
  const point = `SRID=4326;POINT(${at.lng + lateral} ${at.lat - lateral})`;
  const copy = CLASS_COPY[k.class];
  const street = STREETS[idx % STREETS.length];
  const willEscalate = k.conf >= ESCALATE_CONF;

  const [cluster] = await rest("POST", "video_detection_clusters", {
    city_id: city.id,
    location: point,
    class: k.class,
    max_confidence: k.conf,
    frame_count: k.frameCount,
    status: "candidate",
    decision_dossier: {
      seed: SEED_MARKER,
      clip_id: clip.id,
      peak_frame: k.peakFrame,
    },
  });

  const jpg = extractFrame(k.peakFrame);
  const framePath = `${city.id}/demo/frame-${k.peakFrame}.jpg`;
  await upload(FRAMES_BUCKET, framePath, jpg);

  const [detection] = await rest("POST", "damage_detections", {
    clip_id: clip.id,
    city_id: city.id,
    frame_ts_s: tsS,
    frame_path: framePath,
    location: point,
    class: k.class,
    confidence: k.conf,
    bbox: k.bbox,
    cluster_id: cluster.id,
  });

  const patch = { best_detection_id: detection.id, updated_at: new Date().toISOString() };

  if (willEscalate) {
    const reportId = crypto.randomUUID();
    const rawPath = `${city.id}/${reportId}.jpg`;
    await upload(RAW_BUCKET, rawPath, jpg);

    const rationale = `${copy.rationale} (${k.frameCount} frames, peak ${k.conf.toFixed(2)}). Dispatch.`;

    await rest("POST", "reports", {
      id: reportId,
      city_id: city.id,
      reporter_id: reporter.id,
      location: point,
      // Unblurred camera frame stays private; public row gets the placeholder.
      photo_public_url: VIDEO_PLACEHOLDER_PUBLIC_PATH,
      photo_raw_url: `${RAW_BUCKET}/${rawPath}`,
      address: `${100 + idx * 37} ${street}, Cumming, GA 30040`,
      description: copy.description(street),
      tags: ["video-detection"],
      status: "open",
      classify_status: "done",
    });

    await rest("POST", "classifications", {
      report_id: reportId,
      category: copy.category,
      subcategory: copy.subcategory,
      severity: copy.severity(k.conf),
      confidence: k.conf,
      reasoning: rationale,
      is_emergency: false,
      model_version: "demo-canned",
    });

    Object.assign(patch, {
      status: "dispatched",
      decision: "dispatch",
      decision_rationale: rationale,
      report_id: reportId,
      decided_at: new Date().toISOString(),
    });
    escalated++;
  }

  await rest("PATCH", `video_detection_clusters?id=eq.${cluster.id}`, patch);
  console.log(
    `${String(idx + 1).padStart(2)}. ${k.class.padEnd(19)} frame ${String(k.peakFrame).padStart(3)} ` +
      `conf ${k.conf.toFixed(3)} n=${String(k.frameCount).padStart(2)} ` +
      `${willEscalate ? "→ report" : "candidate"}`,
  );
}

console.log(
  `Seeded ${kept.length} cluster(s) + ${kept.length} detection(s) for ${city.name}; ${escalated} escalated to reports.`,
);
