/**
 * Video damage-mapping pipeline configuration (NEXT_100 #70).
 * Pure constants + env reads, mirroring lib/ai/config.ts. Server-only flags —
 * nothing here is NEXT_PUBLIC_.
 */

/**
 * Master switch. When unset/0 the ingest actions refuse, the staff page 404s,
 * and no pipeline code runs. Ships dark by default like AI_WORK_ORDER.
 */
export const VIDEO_PIPELINE = process.env.VIDEO_PIPELINE === "1";

/**
 * Absolute path to the ONNX road-damage detection model (YOLOv8-style export,
 * 640×640 input). Weights are NOT vendored in the repo — fetch with
 * scripts/fetch-video-model.mjs. When unset, clip processing fails with an
 * actionable error instead of silently detecting nothing.
 */
export const VIDEO_DETECT_MODEL_PATH =
  process.env.VIDEO_DETECT_MODEL_PATH ?? "";

/**
 * Detector class names, index-aligned with the model's output channels.
 * Default matches the RDD2022 4-class road-damage convention
 * (D00/D10/D20/D40). Override with a comma-separated list for a model with a
 * different head.
 */
export const VIDEO_DETECT_CLASSES: readonly string[] = (
  process.env.VIDEO_DETECT_CLASSES ??
  "longitudinal_crack,transverse_crack,alligator_crack,pothole"
)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/** Model input edge (square). YOLOv8 exports default to 640. */
export const VIDEO_MODEL_SIZE = 640;

/** Frames sampled per second of video. 1 fps ≈ one frame every ~8 m at 30 km/h. */
export const VIDEO_FRAME_FPS = (() => {
  const parsed = Number(process.env.VIDEO_FRAME_FPS);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10 ? parsed : 1;
})();

/** Minimum detector confidence to PERSIST a detection at all. */
export const VIDEO_DETECT_MIN_CONF = 0.3;

/** IoU threshold for non-maximum suppression across boxes in one frame. */
export const VIDEO_NMS_IOU = 0.45;

/**
 * Cluster confidence at/above which stage 2 (the Gemini decision run) fires.
 * Below it the cluster stays a 'candidate' for manual staff review — the
 * LLM-free stage never spends model budget on weak evidence.
 */
export const VIDEO_ESCALATE_MIN_CONF = (() => {
  const parsed = Number(process.env.VIDEO_ESCALATE_MIN_CONF);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.55;
})();

/** Geo radius (metres) within which same-class detections join one cluster. */
export const VIDEO_CLUSTER_RADIUS_M = 15;

/**
 * Max hamming distance (of 64-bit aHash) for two GPS-less frames to be
 * treated as the same physical scene and clustered together.
 */
export const VIDEO_PHASH_MAX_HAMMING = 10;

/** Upload guardrails for clips (server action rejects beyond these). */
export const VIDEO_MAX_CLIP_BYTES = 200 * 1024 * 1024;
export const VIDEO_MAX_CLIP_SECONDS = 15 * 60;

/** Stamped into video_clips.detector_version for auditability. */
export const VIDEO_DETECTOR_VERSION = "onnx-rdd-v1";
