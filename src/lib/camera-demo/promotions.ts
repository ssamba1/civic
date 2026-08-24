import type { LngLat } from "./route-path";
import { positionAt } from "./route-path";

/** Shape of services/detector/export_detections.py output. */
export interface DetectionExport {
  fps: number;
  width: number;
  height: number;
  frames: Array<{ i: number; boxes: DetectionBox[] }>;
}

export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

export interface Promotion {
  id: string;
  /** Video time (s) at which the cluster promotes and the agent spins off. */
  time: number;
  location: LngLat;
  /** Strongest box at promotion time — shown as evidence confidence. */
  peakConf: number;
  observationCount: number;
}

/**
 * Derive scripted cluster promotions from the per-frame detection export.
 *
 * Mirrors the real promotion rule's *shape* (repeat observation, cooldown)
 * at video speed: a promotion fires when a frame carries a confident box and
 * enough distinct "passes" (frames with detections) accumulated since the
 * last promotion. Pure + deterministic so the demo replays identically.
 */
export function derivePromotions(
  data: DetectionExport,
  {
    minConf = 0.55,
    minFramesWithHits = 12,
    cooldownS = 3,
    durationS,
  }: {
    minConf?: number;
    minFramesWithHits?: number;
    cooldownS?: number;
    durationS?: number;
  } = {},
): Promotion[] {
  const total = data.frames.length;
  const duration = durationS ?? total / data.fps;
  const out: Promotion[] = [];
  let hits = 0;
  let lastPromo = Number.NEGATIVE_INFINITY;

  for (const frame of data.frames) {
    if (frame.boxes.length === 0) continue;
    hits += 1;
    const peak = Math.max(...frame.boxes.map((b) => b.conf));
    const t = frame.i / data.fps;
    if (
      peak >= minConf &&
      hits >= minFramesWithHits &&
      t - lastPromo >= cooldownS
    ) {
      out.push({
        id: `promo-${frame.i}`,
        time: t,
        location: positionAt(t / duration),
        peakConf: peak,
        observationCount: hits,
      });
      lastPromo = t;
      hits = 0;
    }
  }
  return out;
}
