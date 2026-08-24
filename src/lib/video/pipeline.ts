/**
 * Stage-1 orchestrator: video clip → sampled frames → local ONNX detections
 * → geo/visual clusters → (threshold-crossing only) stage-2 decision runs.
 *
 * Runs via next/server after() from the ingest action, same lifecycle pattern
 * as the async classify path. Heavy work (ffmpeg + ONNX) is CPU-bound on the
 * app host — acceptable for phase-1 upload volumes; the planning doc tracks
 * the move to an external worker for continuous rtsp feeds.
 *
 * Error contract mirrors classify-pipeline: handled failures mark the clip
 * 'failed' with an actionable error and log to error_log; nothing here
 * throws into the caller.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { type GeoPoint, normalizeLocation, type Result } from "@/lib/types";
import {
  type ClusterableDetection,
  groupDetections,
} from "@/lib/video/cluster";
import {
  VIDEO_CLUSTER_RADIUS_M,
  VIDEO_DETECTOR_VERSION,
  VIDEO_ESCALATE_MIN_CONF,
  VIDEO_FRAME_FPS,
  VIDEO_PHASH_MAX_HAMMING,
} from "@/lib/video/config";
import { decideCluster } from "@/lib/video/decide";
import { type Detection, detectFrame } from "@/lib/video/detector";
import { frameToGray8, sampleFrames } from "@/lib/video/frame-extract";
import { ahashFromGray8x8 } from "@/lib/video/phash";
import { interpolateTrack, parseTrack } from "@/lib/video/track";

const CLIPS_BUCKET = "video-clips";
const FRAMES_BUCKET = "video-frames";

type SupabaseLike = ReturnType<typeof createServerClient>;

interface ClipRow {
  id: string;
  city_id: string;
  storage_path: string;
  start_location: unknown;
  gps_track: unknown;
  status: string;
}

export interface ProcessClipResult {
  frames_sampled: number;
  detections_found: number;
  clusters_touched: number;
  clusters_escalated: number;
}

/** One frame's persisted-detection payload, pre-insert. */
interface FrameDetection {
  tsSeconds: number;
  framePath: string;
  detection: Detection;
  location: GeoPoint | null;
  phash: string | null;
}

async function markClipFailed(
  supabase: SupabaseLike,
  clipId: string,
  error: string,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  log.error(error, undefined, { clipId });
  await supabase.from("error_log").insert({
    correlation_id: log.correlationId,
    context: "video-pipeline",
    message: error,
    metadata: { clipId },
  });
  await supabase
    .from("video_clips")
    .update({ status: "failed", error })
    .eq("id", clipId);
}

/**
 * Find-or-create the DB cluster for one in-memory group, keeping stats
 * (frame_count, max_confidence, best_detection_id) rolled up. Cross-clip
 * continuity goes through the PostGIS RPC — hard rule 7.
 */
async function upsertCluster(
  supabase: SupabaseLike,
  cityId: string,
  group: { class: string; location: GeoPoint | null; maxConfidence: number },
  memberCount: number,
  bestDetectionId: string,
  log: ReturnType<typeof createLogger>,
): Promise<Result<string>> {
  let existingId: string | null = null;
  if (group.location) {
    const { data, error } = await supabase.rpc(
      "find_nearby_detection_cluster",
      {
        _city_id: cityId,
        _lng: group.location.lng,
        _lat: group.location.lat,
        _class: group.class,
        _radius_m: VIDEO_CLUSTER_RADIUS_M,
      },
    );
    if (error) {
      log.warn("nearby_cluster_rpc_failed", { error: error.message });
    } else if (typeof data === "string" && data.length > 0) {
      existingId = data;
    }
  }

  if (existingId) {
    const { data: row } = await supabase
      .from("detection_clusters")
      .select("frame_count, max_confidence")
      .eq("id", existingId)
      .single<{ frame_count: number; max_confidence: number }>();
    const better = (row?.max_confidence ?? 0) < group.maxConfidence;
    const { error } = await supabase
      .from("detection_clusters")
      .update({
        frame_count: (row?.frame_count ?? 0) + memberCount,
        max_confidence: Math.max(row?.max_confidence ?? 0, group.maxConfidence),
        ...(better ? { best_detection_id: bestDetectionId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: existingId };
  }

  const { data: inserted, error } = await supabase
    .from("detection_clusters")
    .insert({
      city_id: cityId,
      class: group.class,
      location: group.location
        ? `SRID=4326;POINT(${group.location.lng} ${group.location.lat})`
        : null,
      max_confidence: group.maxConfidence,
      frame_count: memberCount,
      best_detection_id: bestDetectionId,
      status: "candidate",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !inserted) {
    return {
      ok: false,
      error: error?.message ?? "cluster insert returned no row",
    };
  }
  return { ok: true, data: inserted.id };
}

/** Process one uploaded clip end-to-end. Never throws. */
export async function processClip(
  clipId: string,
): Promise<Result<ProcessClipResult>> {
  const log = createLogger("video-pipeline");
  const supabase = createServerClient();
  log.info("clip_start", { clipId });

  const { data: clip, error: clipErr } = await supabase
    .from("video_clips")
    .select("id, city_id, storage_path, start_location, gps_track, status")
    .eq("id", clipId)
    .single<ClipRow>();
  if (clipErr || !clip) {
    const msg = `Clip not found: ${clipErr?.message ?? "no rows"}`;
    log.error(msg, undefined, { clipId });
    return { ok: false, error: msg };
  }

  await supabase
    .from("video_clips")
    .update({ status: "processing" })
    .eq("id", clipId);

  // Download the clip to local disk for ffmpeg.
  const { data: blob, error: dlErr } = await supabase.storage
    .from(CLIPS_BUCKET)
    .download(clip.storage_path);
  if (dlErr || !blob) {
    const msg = `Clip download failed: ${dlErr?.message ?? "empty blob"}`;
    await markClipFailed(supabase, clipId, msg, log);
    return { ok: false, error: msg };
  }

  let workDir: string | null = null;
  let framesCleanup: (() => Promise<void>) | null = null;
  try {
    workDir = await mkdtemp(join(tmpdir(), "civic-clip-"));
    const clipPath = join(workDir, "clip.bin");
    await writeFile(clipPath, Buffer.from(await blob.arrayBuffer()));

    const sampled = await sampleFrames(clipPath, VIDEO_FRAME_FPS);
    if (!sampled.ok) {
      await markClipFailed(supabase, clipId, sampled.error, log);
      return sampled;
    }
    framesCleanup = sampled.data.cleanup;
    const frames = sampled.data.frames;
    log.info("frames_sampled", { clipId, count: frames.length });

    const track = parseTrack(clip.gps_track);
    // Fixed camera / no track: every detection inherits the clip's start
    // location (may itself be null — clusters then rely on visual grouping).
    const fallbackLocation = track.length === 0 ? locationFromClip(clip) : null;

    // Detect frame-by-frame. Detector unavailability is a clip-level failure
    // (actionable: install model), not a silent all-clear.
    const found: FrameDetection[] = [];
    for (const frame of frames) {
      const result = await detectFrame(frame.path);
      if (!result.ok) {
        await markClipFailed(supabase, clipId, result.error, log);
        return result;
      }
      if (result.data.length === 0) continue;
      const gray = await frameToGray8(frame.path);
      const phash = gray.ok ? ahashFromGray8x8(gray.data) : null;
      const location =
        track.length > 0
          ? interpolateTrack(track, frame.tsSeconds)
          : fallbackLocation;
      for (const detection of result.data) {
        found.push({
          tsSeconds: frame.tsSeconds,
          framePath: frame.path,
          detection,
          location,
          phash,
        });
      }
    }
    log.info("detections_found", { clipId, count: found.length });

    let clustersTouched = 0;
    let clustersEscalated = 0;

    if (found.length > 0) {
      // Upload each detection's frame once (dedup on path).
      const uploadedPaths = new Map<string, string>();
      for (const fd of found) {
        if (uploadedPaths.has(fd.framePath)) continue;
        const objectPath = `${clip.city_id}/${clip.id}/${fd.tsSeconds.toFixed(2)}.jpg`;
        const bytes = await readFile(fd.framePath);
        const { error: upErr } = await supabase.storage
          .from(FRAMES_BUCKET)
          .upload(objectPath, bytes, {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (upErr) {
          const msg = `Frame upload failed: ${upErr.message}`;
          await markClipFailed(supabase, clipId, msg, log);
          return { ok: false, error: msg };
        }
        uploadedPaths.set(fd.framePath, objectPath);
      }

      const { data: insertedRows, error: insErr } = await supabase
        .from("damage_detections")
        .insert(
          found.map((fd) => ({
            clip_id: clip.id,
            city_id: clip.city_id,
            frame_ts_s: fd.tsSeconds,
            frame_path: uploadedPaths.get(fd.framePath) ?? "",
            location: fd.location
              ? `SRID=4326;POINT(${fd.location.lng} ${fd.location.lat})`
              : null,
            class: fd.detection.class,
            confidence: fd.detection.confidence,
            bbox: fd.detection.bbox,
            phash: fd.phash,
          })),
        )
        .select("id");
      if (insErr || !insertedRows || insertedRows.length !== found.length) {
        const msg = `Detection insert failed: ${insErr?.message ?? "row count mismatch"}`;
        await markClipFailed(supabase, clipId, msg, log);
        return { ok: false, error: msg };
      }
      const detectionIds = (insertedRows as { id: string }[]).map((r) => r.id);

      const groups = groupDetections(
        found.map(
          (fd, index): ClusterableDetection => ({
            index,
            class: fd.detection.class,
            confidence: fd.detection.confidence,
            location: fd.location,
            phash: fd.phash,
          }),
        ),
        VIDEO_CLUSTER_RADIUS_M,
        VIDEO_PHASH_MAX_HAMMING,
      );

      for (const group of groups) {
        const clusterResult = await upsertCluster(
          supabase,
          clip.city_id,
          {
            class: group.class,
            location: group.location,
            maxConfidence: group.maxConfidence,
          },
          group.indices.length,
          detectionIds[group.bestIndex],
          log,
        );
        if (!clusterResult.ok) {
          log.error("cluster_upsert_failed", undefined, {
            clipId,
            error: clusterResult.error,
          });
          continue;
        }
        clustersTouched++;
        const clusterId = clusterResult.data;

        const { error: linkErr } = await supabase
          .from("damage_detections")
          .update({ cluster_id: clusterId })
          .in(
            "id",
            group.indices.map((i) => detectionIds[i]),
          );
        if (linkErr) {
          log.warn("detection_link_failed", {
            clusterId,
            error: linkErr.message,
          });
        }

        // Stage-2 escalation — strictly gated on the LLM-free confidence.
        // decideCluster is best-effort: a failure leaves the cluster at
        // 'candidate' and a later clip (or manual escalation) retries.
        if (group.maxConfidence >= VIDEO_ESCALATE_MIN_CONF) {
          const decided = await decideCluster(clusterId);
          if (decided.ok) clustersEscalated++;
          else
            log.warn("escalation_failed", {
              clusterId,
              error: decided.error,
            });
        }
      }
    }

    const { error: doneErr } = await supabase
      .from("video_clips")
      .update({
        status: "done",
        error: null,
        frames_sampled: frames.length,
        detections_found: found.length,
        detector_version: VIDEO_DETECTOR_VERSION,
      })
      .eq("id", clipId);
    if (doneErr) {
      log.warn("clip_done_stamp_failed", { clipId, error: doneErr.message });
    }

    const summary: ProcessClipResult = {
      frames_sampled: frames.length,
      detections_found: found.length,
      clusters_touched: clustersTouched,
      clusters_escalated: clustersEscalated,
    };
    log.info("clip_done", { clipId, ...summary });
    return { ok: true, data: summary };
  } catch (err) {
    const msg = `Unhandled clip processing error: ${err instanceof Error ? err.message : String(err)}`;
    await markClipFailed(supabase, clipId, msg, log);
    return { ok: false, error: msg };
  } finally {
    if (framesCleanup) await framesCleanup();
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}

function locationFromClip(clip: ClipRow): GeoPoint | null {
  // start_location arrives as hex EWKB from PostgREST; normalizeLocation in
  // lib/types handles that plus GeoJSON/WKT.
  return normalizeLocation(clip.start_location);
}
