/**
 * LLM-free road-damage detector — a local YOLOv8-style ONNX model run via
 * onnxruntime-node. This is the cheap continuous stage: it never calls a
 * hosted model API, so scanning hours of video costs CPU only.
 *
 * onnxruntime-node is an optionalDependency (native binary; platforms where
 * install fails still build and run the rest of the app). It is loaded via a
 * non-literal dynamic import so the build never hard-links it, and absence
 * degrades to ok:false with an actionable error — a clip then fails visibly
 * rather than pretending the road was clean.
 */

import type { Result } from "@/lib/types";
import {
  VIDEO_DETECT_CLASSES,
  VIDEO_DETECT_MIN_CONF,
  VIDEO_DETECT_MODEL_PATH,
  VIDEO_MODEL_SIZE,
  VIDEO_NMS_IOU,
} from "@/lib/video/config";
import { frameToRawRgb } from "@/lib/video/frame-extract";

/** One detector hit within a single frame. */
export interface Detection {
  /** Detector class key (index-mapped through VIDEO_DETECT_CLASSES). */
  class: string;
  /** Model confidence in [0,1]. */
  confidence: number;
  /** Normalized {x, y, w, h} in [0,1] frame coordinates (top-left origin). */
  bbox: { x: number; y: number; w: number; h: number };
}

// Minimal structural types for the slice of onnxruntime-node we use — local
// on purpose: the module is optional, so its own types may not be installed.
interface OrtTensor {
  data: Float32Array;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  InferenceSession: {
    create(path: string): Promise<OrtSession>;
  };
  Tensor: new (
    type: "float32",
    data: Float32Array,
    dims: readonly number[],
  ) => OrtTensor;
}

/** Interleaved RGB bytes → normalized CHW float tensor data. Pure. */
export function rgbToChwFloat(rgb: Uint8Array, size: number): Float32Array {
  const pixels = size * size;
  const out = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    out[i] = rgb[i * 3] / 255;
    out[pixels + i] = rgb[i * 3 + 1] / 255;
    out[2 * pixels + i] = rgb[i * 3 + 2] / 255;
  }
  return out;
}

/** Intersection-over-union of two normalized {x,y,w,h} boxes. Pure. */
export function iou(a: Detection["bbox"], b: Detection["bbox"]): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy per-class non-maximum suppression. Pure. */
export function nms(dets: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const d of sorted) {
    const overlaps = kept.some(
      (k) => k.class === d.class && iou(k.bbox, d.bbox) > iouThreshold,
    );
    if (!overlaps) kept.push(d);
  }
  return kept;
}

/**
 * Decode a YOLOv8 detection head into normalized detections. Handles both
 * layouts seen in exports: [1, 4+nc, N] (channel-first, the ultralytics
 * default) and [1, N, 4+nc]. Box values are cx,cy,w,h in input-pixel units.
 * Pure — the unit tests exercise this with synthetic tensors.
 */
export function decodeYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  classNames: readonly string[],
  confThreshold: number,
  modelSize: number,
): Detection[] {
  if (dims.length !== 3 || dims[0] !== 1) return [];
  const attrs = 4 + classNames.length;
  let n: number;
  let get: (attr: number, box: number) => number;
  if (dims[1] === attrs) {
    n = dims[2];
    get = (attr, box) => data[attr * n + box];
  } else if (dims[2] === attrs) {
    n = dims[1];
    get = (attr, box) => data[box * attrs + attr];
  } else {
    return [];
  }

  const out: Detection[] = [];
  for (let j = 0; j < n; j++) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < classNames.length; c++) {
      const s = get(4 + c, j);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best < 0 || bestScore < confThreshold) continue;
    const cx = get(0, j) / modelSize;
    const cy = get(1, j) / modelSize;
    const w = get(2, j) / modelSize;
    const h = get(3, j) / modelSize;
    // Clamp to [0,1]: exports can emit boxes slightly outside the frame.
    const x = Math.min(1, Math.max(0, cx - w / 2));
    const y = Math.min(1, Math.max(0, cy - h / 2));
    out.push({
      class: classNames[best],
      confidence: bestScore,
      bbox: {
        x,
        y,
        w: Math.min(1 - x, Math.max(0, w)),
        h: Math.min(1 - y, Math.max(0, h)),
      },
    });
  }
  return out;
}

// Session is created once per process and reused across clips/frames.
let sessionPromise: Promise<
  Result<{ ort: OrtModule; session: OrtSession }>
> | null = null;

function loadSession(): Promise<
  Result<{ ort: OrtModule; session: OrtSession }>
> {
  if (!sessionPromise) {
    sessionPromise = (async (): Promise<
      Result<{ ort: OrtModule; session: OrtSession }>
    > => {
      if (!VIDEO_DETECT_MODEL_PATH) {
        return {
          ok: false,
          error:
            "detector_not_configured: set VIDEO_DETECT_MODEL_PATH to a road-damage ONNX model (scripts/fetch-video-model.mjs)",
        };
      }
      try {
        // Non-literal specifier: keeps the optional native module out of the
        // Next build graph; resolved from node_modules at runtime only.
        const moduleName = "onnxruntime-node";
        const ort = (await import(moduleName)) as unknown as OrtModule;
        const session = await ort.InferenceSession.create(
          VIDEO_DETECT_MODEL_PATH,
        );
        return { ok: true, data: { ort, session } };
      } catch (err) {
        // Reset so a fixed environment (model file added, module installed)
        // can recover without a process restart.
        sessionPromise = null;
        return {
          ok: false,
          error: `detector_unavailable: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    })();
  }
  return sessionPromise;
}

/**
 * Run the detector over one frame on disk. Returns NMS-filtered detections at
 * or above VIDEO_DETECT_MIN_CONF. ok:false (never throws) when ffmpeg, the
 * runtime, or the model is unavailable.
 */
export async function detectFrame(
  framePath: string,
): Promise<Result<Detection[]>> {
  const loaded = await loadSession();
  if (!loaded.ok) return loaded;
  const { ort, session } = loaded.data;

  const rgb = await frameToRawRgb(framePath, VIDEO_MODEL_SIZE);
  if (!rgb.ok) return rgb;

  try {
    const tensor = new ort.Tensor(
      "float32",
      rgbToChwFloat(rgb.data, VIDEO_MODEL_SIZE),
      [1, 3, VIDEO_MODEL_SIZE, VIDEO_MODEL_SIZE],
    );
    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const first = outputs[session.outputNames[0]];
    if (!first)
      return { ok: false, error: "Detector returned no output tensor" };
    const raw = decodeYoloOutput(
      first.data,
      first.dims,
      VIDEO_DETECT_CLASSES,
      VIDEO_DETECT_MIN_CONF,
      VIDEO_MODEL_SIZE,
    );
    return { ok: true, data: nms(raw, VIDEO_NMS_IOU) };
  } catch (err) {
    return {
      ok: false,
      error: `Detector inference failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
