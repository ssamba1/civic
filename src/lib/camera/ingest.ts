// Camera frame ingest (CAMERA_LIABILITY_PIPELINE.md §4).
//
// Pipeline per frame:
//   detector gate -> below-threshold frames DROPPED ENTIRELY (never stored)
//   -> surviving crops through blurServerSide() -> blurred bytes to photos-public
//   -> detections row -> clustering (cluster.ts) -> promotion writes a report
//   -> runClassifyPipeline(reportId)
//
// Writer semantics mirror F5_INGEST.md §3: service-role client, reporter_id
// NULL, `source` set so camera volume never inflates resident KPIs (§4.6), and
// `source_external_id` = cluster id for free replay safety.
//
// PRIVACY: raw frames are NEVER persisted. Only blurred crops reach storage,
// and a crop whose blur fails is dropped (blur-server.ts hard rule).

import "server-only";

import { runClassifyPipeline } from "@/lib/ai/classify-pipeline";
import { createServerClient } from "@/lib/db/client";
import { CLUSTER_RADIUS_M } from "@/lib/liability/config";
import { createLogger } from "@/lib/logger";
import { blurServerSide } from "@/lib/privacy/blur-server";
import type { Result } from "@/lib/types";
import {
  assignCluster,
  type ClusterCandidate,
  type DetectionObservation,
  pickBestObservation,
  shouldPromote,
} from "./cluster";

const logger = createLogger("camera-ingest");

const PUBLIC_BUCKET = "photos-public";

/** Below this detector score the frame is thrown away before anything is stored. */
export const DETECTOR_MIN_SCORE = 0.5;

/** Sidecar detect budget per frame. Batches ride depot wifi, not realtime. */
const DETECT_TIMEOUT_MS = 30_000;

export interface CameraFrame {
  /** Device-local frame id, the idempotency key. */
  externalId: string;
  capturedAt: string;
  lng: number;
  lat: number;
  headingDeg?: number | null;
  speedMps?: number | null;
  imageBase64OrUrl: string;
}

export interface IngestError {
  code: "detector_unavailable" | "db_error" | "device_unknown" | "internal";
  message: string;
  /** True when the caller should retry the same batch unchanged (-> HTTP 503). */
  retryable: boolean;
}

export type FrameStatus =
  | "duplicate"
  | "no_detection"
  | "blur_dropped"
  | "ingested";

export interface FrameOutcome {
  externalId: string;
  status: FrameStatus;
  detections: number;
}

export interface IngestBatchSummary {
  frames: FrameOutcome[];
  detectionsStored: number;
  promotedReportIds: string[];
}

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface IngestDeps {
  db?: SupabaseLike;
  detectorUrl?: string;
  /** Override for tests; defaults to the real sidecar-backed blur. */
  blur?: typeof blurServerSide;
  /** Override for tests; defaults to the live classify pipeline. */
  classify?: (reportId: string) => Promise<unknown>;
}

/** One box from the detector sidecar (see services/detector/contract.md). */
interface DetectorBox {
  damageClass: string;
  score: number;
  bbox: [number, number, number, number];
  /** Base64 crop of the box, produced by the sidecar. */
  cropBase64: string;
}

function detectorBaseUrl(deps: IngestDeps): string | null {
  const url = (deps.detectorUrl ?? process.env.DETECTOR_URL)?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/**
 * Call the sidecar's /detect for one frame. Any transport or protocol failure
 * is `retryable`. Frames queue and the batch is retried; ingest must never
 * block report creation from other sources (spec §6).
 */
async function detectFrame(
  base: string,
  frame: CameraFrame,
): Promise<Result<DetectorBox[], IngestError>> {
  try {
    const res = await fetch(`${base}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: frame.imageBase64OrUrl,
        captured_at: frame.capturedAt,
        speed_mps: frame.speedMps ?? null,
        min_score: DETECTOR_MIN_SCORE,
      }),
      signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: "detector_unavailable",
          message: `detector responded ${res.status}`,
          retryable: true,
        },
      };
    }
    const body = (await res.json()) as {
      detections?: Array<{
        class?: string;
        score?: number;
        bbox?: number[];
        crop_base64?: string;
      }>;
    };
    const boxes: DetectorBox[] = [];
    for (const d of body.detections ?? []) {
      const score = typeof d.score === "number" ? d.score : 0;
      const cls = typeof d.class === "string" ? d.class : "";
      const crop = typeof d.crop_base64 === "string" ? d.crop_base64 : "";
      const bbox = Array.isArray(d.bbox) && d.bbox.length === 4 ? d.bbox : null;
      // A box with no crop cannot be blurred, so it cannot be stored.
      if (!cls || !crop || !bbox || score < DETECTOR_MIN_SCORE) continue;
      boxes.push({
        damageClass: cls,
        score,
        bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
        cropBase64: crop,
      });
    }
    return { ok: true, data: boxes };
  } catch (err) {
    logger.error("detector_unreachable", err);
    return {
      ok: false,
      error: {
        code: "detector_unavailable",
        message: "detector sidecar unreachable",
        retryable: true,
      },
    };
  }
}

/** Frame ids already ingested for this device, free replay safety. */
async function existingFrameIds(
  db: SupabaseLike,
  deviceId: string,
  ids: string[],
): Promise<Result<Set<string>, IngestError>> {
  const { data, error } = await db
    .from("detections")
    .select("frame_external_id")
    .eq("device_id", deviceId)
    .in("frame_external_id", ids);
  if (error) {
    return {
      ok: false,
      error: { code: "db_error", message: error.message, retryable: true },
    };
  }
  return {
    ok: true,
    data: new Set(
      (data ?? []).map(
        (r) => (r as { frame_external_id: string }).frame_external_id,
      ),
    ),
  };
}

/**
 * Nearby clusters via PostGIS (agents.md rule #7, no haversine in app code).
 *
 * DEPENDS ON migration 064 shipping `camera_nearby_clusters(_city_id, _lng,
 * _lat, _radius_m, _damage_class)` returning cluster rows plus `distance_m`.
 * A failure here is surfaced as a retryable error rather than swallowed:
 * treating "query failed" as "no nearby cluster" would silently open a fresh
 * cluster per pass and re-create the 3,600-reports-per-pothole problem.
 */
async function nearbyClusters(
  db: SupabaseLike,
  cityId: string,
  frame: CameraFrame,
  damageClass: string,
): Promise<Result<ClusterCandidate[], IngestError>> {
  const { data, error } = await db.rpc("camera_nearby_clusters", {
    _city_id: cityId,
    _lng: frame.lng,
    _lat: frame.lat,
    // Same bound assignCluster re-asserts. A wider query would only return
    // clusters the pure function then rejects.
    _radius_m: CLUSTER_RADIUS_M,
    _damage_class: damageClass,
  });
  if (error) {
    logger.error("camera_nearby_clusters_failed", undefined, {
      error: error.message,
    });
    return {
      ok: false,
      error: { code: "db_error", message: error.message, retryable: true },
    };
  }
  const rows = (data ?? []) as Array<{
    id: string;
    damage_class: string;
    state: string;
    observation_count: number | string;
    distance_m: number | string;
  }>;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      damageClass: r.damage_class,
      state: r.state as ClusterCandidate["state"],
      observationCount: Number(r.observation_count),
      distanceM: Number(r.distance_m),
    })),
  };
}

/**
 * Ingest one batch of frames for a registered device.
 *
 * Returns a retryable error (-> 503 at the route) when the sidecar or the DB is
 * unavailable; the uploader replays the identical batch and idempotency on
 * `(device_id, frame_external_id)` makes that free.
 */
export async function ingestFrameBatch(
  input: { deviceId: string; cityId: string; frames: CameraFrame[] },
  deps: IngestDeps = {},
): Promise<Result<IngestBatchSummary, IngestError>> {
  const db = deps.db ?? createServerClient();
  const blur = deps.blur ?? blurServerSide;
  const classify = deps.classify ?? runClassifyPipeline;
  const { deviceId, cityId, frames } = input;

  const summary: IngestBatchSummary = {
    frames: [],
    detectionsStored: 0,
    promotedReportIds: [],
  };
  if (frames.length === 0) return { ok: true, data: summary };

  const base = detectorBaseUrl(deps);
  if (!base) {
    return {
      ok: false,
      error: {
        code: "detector_unavailable",
        message: "DETECTOR_URL is not configured",
        retryable: true,
      },
    };
  }

  const seen = await existingFrameIds(
    db,
    deviceId,
    frames.map((f) => f.externalId),
  );
  if (!seen.ok) return seen;

  const touchedClusters = new Set<string>();

  for (const frame of frames) {
    if (seen.data.has(frame.externalId)) {
      summary.frames.push({
        externalId: frame.externalId,
        status: "duplicate",
        detections: 0,
      });
      continue;
    }

    const detected = await detectFrame(base, frame);
    // Sidecar trouble aborts the whole batch: a half-ingested route is worse
    // than a clean retry, and the remaining frames would fail identically.
    if (!detected.ok) return detected;

    if (detected.data.length === 0) {
      // ~95% of frames land here. Nothing is written, not the frame, not a row.
      summary.frames.push({
        externalId: frame.externalId,
        status: "no_detection",
        detections: 0,
      });
      continue;
    }

    let stored = 0;
    let blurDropped = 0;

    for (let i = 0; i < detected.data.length; i++) {
      const box = detected.data[i];

      // --- privacy gate ---------------------------------------------------
      // Blur first, upload second. If blur fails the crop is dropped and the
      // detection is not recorded at all. There is no unblurred fallback.
      const blurred = await blur(Buffer.from(box.cropBase64, "base64"));
      if (!blurred.ok) {
        blurDropped++;
        logger.warn("camera_crop_dropped_blur_failed", {
          deviceId,
          frameExternalId: frame.externalId,
          reason: blurred.error,
        });
        continue;
      }

      const path = `camera/${deviceId}/${frame.externalId}-${i}.webp`;
      const { error: upErr } = await db.storage
        .from(PUBLIC_BUCKET)
        .upload(path, blurred.data.bytes, {
          contentType: "image/webp",
          upsert: false,
        });
      if (upErr) {
        logger.error("camera_crop_upload_failed", undefined, {
          path,
          error: upErr.message,
        });
        continue;
      }
      const {
        data: { publicUrl },
      } = db.storage.from(PUBLIC_BUCKET).getPublicUrl(path);

      const observation: DetectionObservation = {
        damageClass: box.damageClass,
        capturedAt: frame.capturedAt,
        score: box.score,
        speedMps: frame.speedMps ?? null,
      };

      const candidates = await nearbyClusters(
        db,
        cityId,
        frame,
        box.damageClass,
      );
      if (!candidates.ok) return candidates;

      const assignment = assignCluster(observation, candidates.data);
      const clusterId =
        assignment.kind === "join"
          ? assignment.clusterId
          : await createCluster(db, cityId, frame, observation);
      if (clusterId === null) {
        return {
          ok: false,
          error: {
            code: "db_error",
            message: "cluster insert failed",
            retryable: true,
          },
        };
      }

      const { error: detErr } = await db.from("detections").insert({
        device_id: deviceId,
        city_id: cityId,
        frame_external_id: frame.externalId,
        captured_at: frame.capturedAt,
        location: `SRID=4326;POINT(${frame.lng} ${frame.lat})`,
        damage_class: box.damageClass,
        score: box.score,
        crop_url: publicUrl,
        cluster_id: clusterId,
      });
      if (detErr) {
        // 23505 = the uniqueness guard fired: this frame raced with a replay.
        if (detErr.code === "23505") continue;
        logger.error("detection_insert_failed", undefined, {
          error: detErr.message,
        });
        return {
          ok: false,
          error: { code: "db_error", message: detErr.message, retryable: true },
        };
      }

      await bumpCluster(db, clusterId, frame.capturedAt, box.score);
      touchedClusters.add(clusterId);
      stored++;
    }

    summary.detectionsStored += stored;
    summary.frames.push({
      externalId: frame.externalId,
      status:
        stored > 0
          ? "ingested"
          : blurDropped > 0
            ? "blur_dropped"
            : "no_detection",
      detections: stored,
    });
  }

  for (const clusterId of touchedClusters) {
    const promoted = await maybePromote(db, clusterId, classify);
    if (promoted) summary.promotedReportIds.push(promoted);
  }

  return { ok: true, data: summary };
}

async function createCluster(
  db: SupabaseLike,
  cityId: string,
  frame: CameraFrame,
  observation: DetectionObservation,
): Promise<string | null> {
  const { data, error } = await db
    .from("detection_clusters")
    .insert({
      city_id: cityId,
      centroid: `SRID=4326;POINT(${frame.lng} ${frame.lat})`,
      damage_class: observation.damageClass,
      first_seen_at: frame.capturedAt,
      last_seen_at: frame.capturedAt,
      observation_count: 0,
      peak_score: observation.score,
      state: "observing",
    })
    .select("id")
    .single();
  if (error || !data) {
    logger.error("cluster_insert_failed", undefined, {
      error: error?.message ?? "no row",
    });
    return null;
  }
  return (data as { id: string }).id;
}

/**
 * Newest-first cap on the detections loaded to decide a cluster's promotion.
 * Far above the 3-pass / 2-distinct-day thresholds it feeds.
 */
const MAX_CLUSTER_OBSERVATIONS = 500;

/** Attempts before giving up on the compare-and-swap below. */
const BUMP_CAS_ATTEMPTS = 5;

/**
 * Roll one detection into its cluster's running stats.
 *
 * This is a read-modify-write on a row that concurrent ingests contend for,
 * two cameras covering the same intersection bump the same cluster at the same
 * time. A plain SELECT-then-UPDATE loses increments: both readers see
 * observation_count = 10, both write 11, and one observation vanishes. Since
 * observation_count feeds the promotion threshold, a busy location was
 * systematically under-counted and promoted late or not at all.
 *
 * The UPDATE therefore carries the value we read as a guard
 * (`.eq("observation_count", seen)`), making it a compare-and-swap: if another
 * writer got there first the predicate matches no rows, and we re-read and try
 * again. Doing the arithmetic in a single SQL statement would be better still,
 * but that needs a new RPC (a migration), so this closes the lost update using
 * only the schema that exists.
 */
async function bumpCluster(
  db: SupabaseLike,
  clusterId: string,
  capturedAt: string,
  score: number,
): Promise<void> {
  for (let attempt = 0; attempt < BUMP_CAS_ATTEMPTS; attempt++) {
    const { data, error } = await db
      .from("detection_clusters")
      .select("observation_count, peak_score, last_seen_at, first_seen_at")
      .eq("id", clusterId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as {
      observation_count: number;
      peak_score: number | null;
      last_seen_at: string;
      first_seen_at: string;
    };
    const seen = Number(row.observation_count);

    const { data: updated, error: updateError } = await db
      .from("detection_clusters")
      .update({
        observation_count: seen + 1,
        peak_score: Math.max(Number(row.peak_score ?? 0), score),
        last_seen_at:
          Date.parse(capturedAt) > Date.parse(row.last_seen_at)
            ? capturedAt
            : row.last_seen_at,
        first_seen_at:
          Date.parse(capturedAt) < Date.parse(row.first_seen_at)
            ? capturedAt
            : row.first_seen_at,
      })
      .eq("id", clusterId)
      // CAS guard. No match means someone else bumped it since our read.
      .eq("observation_count", seen)
      .select("id");

    if (updateError) return;
    if (updated && updated.length > 0) return; // we won the race
  }
}

/**
 * Promote a cluster to a report once it clears the confirmation threshold.
 * Only this event calls Gemini, one LLM call per real defect, not per frame.
 */
async function maybePromote(
  db: SupabaseLike,
  clusterId: string,
  classify: (reportId: string) => Promise<unknown>,
): Promise<string | null> {
  const { data: clusterRow, error: cErr } = await db
    .from("detection_clusters")
    .select("id, city_id, state, first_seen_at, centroid")
    .eq("id", clusterId)
    .maybeSingle();
  if (cErr || !clusterRow) return null;
  const cluster = clusterRow as {
    id: string;
    city_id: string;
    state: string;
    first_seen_at: string;
    centroid: unknown;
  };

  // Bounded. A cluster on a busy route accumulates a detection per camera pass
  // indefinitely, and this ran on every stored box with no limit. The row set
  // grows without bound while the two things it feeds need very little of it:
  // shouldPromote wants >= PROMOTE_MIN_PASSES (3) rows across >=
  // PROMOTE_MIN_DISTINCT_DAYS (2) days, and pickBestObservation wants the
  // top-scoring crop. Newest-first also makes the evidence crop current, which
  // is what a claim packet should show.
  const { data: detRows, error: dErr } = await db
    .from("detections")
    .select("damage_class, captured_at, score, crop_url")
    .eq("cluster_id", clusterId)
    .order("captured_at", { ascending: false })
    .limit(MAX_CLUSTER_OBSERVATIONS);
  if (dErr || !detRows) return null;

  const observations = (
    detRows as Array<{
      damage_class: string;
      captured_at: string;
      score: number | string;
      crop_url: string | null;
    }>
  ).map((d) => ({
    damageClass: d.damage_class,
    capturedAt: d.captured_at,
    score: Number(d.score),
    cropUrl: d.crop_url,
  }));

  if (
    !shouldPromote(
      { state: cluster.state as ClusterCandidate["state"] },
      observations,
    )
  ) {
    return null;
  }

  const best = pickBestObservation(observations);
  if (!best?.cropUrl) return null;

  // Writer semantics per F5_INGEST.md §3 + spec §4.6:
  //  - source 'camera' keeps this out of resident-engagement KPIs
  //  - source_external_id = cluster id, so a replayed promotion is a no-op
  //  - reporter_id NULL (migration 015 allows it). There is no reporter
  //  - created_at = first observation, so the liability window is evaluated
  //    against when the defect actually appeared, not when it was confirmed
  const { data: reportRow, error: rErr } = await db
    .from("reports")
    .insert({
      city_id: cluster.city_id,
      reporter_id: null,
      source: "camera",
      source_external_id: cluster.id,
      location: centroidToEwkt(cluster.centroid),
      photo_public_url: best.cropUrl,
      photo_raw_url: null,
      address: null,
      status: "open",
      created_at: cluster.first_seen_at,
    })
    .select("id")
    .single();
  if (rErr || !reportRow) {
    logger.error("camera_report_insert_failed", undefined, {
      clusterId,
      error: rErr?.message ?? "no row",
    });
    return null;
  }
  const reportId = (reportRow as { id: string }).id;

  await db
    .from("detection_clusters")
    .update({ state: "promoted", promoted_report_id: reportId })
    .eq("id", clusterId);
  await db
    .from("detections")
    .update({ report_id: reportId })
    .eq("cluster_id", clusterId);

  try {
    await classify(reportId);
  } catch (err) {
    // Existing fallback classification handles this (spec §6). The cluster is
    // still a report either way.
    logger.error("camera_classify_failed", err, { reportId });
  }

  await suppressAutoEmergency(db, reportId);
  return reportId;
}

/**
 * Camera reports NEVER auto-dispatch as emergencies.
 *
 * A promoted cluster is by construction at least PROMOTE_MIN_DISTINCT_DAYS old,
 * and a frame from a passing bus cannot establish that someone is in danger
 * right now the way a resident standing at the scene can. Auto-dispatching a
 * crew off it would spend overtime on stale evidence, so the flag is cleared
 * after classification and the report re-opened if the pipeline dispatched it.
 */
async function suppressAutoEmergency(
  db: SupabaseLike,
  reportId: string,
): Promise<void> {
  const { error: cErr } = await db
    .from("classifications")
    .update({ is_emergency: false })
    .eq("report_id", reportId);
  if (cErr) {
    logger.warn("camera_emergency_clear_failed", {
      reportId,
      error: cErr.message,
    });
  }
  const { error: rErr } = await db
    .from("reports")
    .update({ status: "open" })
    .eq("id", reportId)
    .eq("status", "dispatched");
  if (rErr) {
    logger.warn("camera_status_reset_failed", {
      reportId,
      error: rErr.message,
    });
  }
}

/** PostgREST returns geography as GeoJSON; rebuild the EWKT the writer needs. */
function centroidToEwkt(centroid: unknown): string {
  if (
    centroid &&
    typeof centroid === "object" &&
    "coordinates" in centroid &&
    Array.isArray((centroid as { coordinates: unknown }).coordinates)
  ) {
    const [lng, lat] = (centroid as { coordinates: number[] }).coordinates;
    return `SRID=4326;POINT(${lng} ${lat})`;
  }
  return String(centroid ?? "");
}
