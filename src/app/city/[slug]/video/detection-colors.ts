/* ==================================================================
   Detector class → hue. ONE source for every surface in the video
   console that colors a detection class (card accent, class dot,
   confidence bar, evidence box + its label).

   A detector class is CATEGORICAL. Pothole is not "worse than" a
   transverse crack, it is a different thing, so it draws from the
   decorative pastel ramp, exactly the inverse of `severity-colors.ts`,
   where an ordinal state is built from the semantic --status-* tokens.
   Keep that split: nothing here may leak into a severity or a status.

   The five keys are the RDD2022 four-class head (see
   VIDEO_DETECT_CLASSES in src/lib/video/config.ts) plus `debris`, which
   seeded corpora carry. An unrecognised class falls back to grey rather
   than borrowing a hue that already means something else.

   `fill` is the low-alpha/opaque tint (chips, bar tracks, box washes);
   `strong` is the AA-ish saturated variant used for strokes, dots and
   bar fills. Never use either for body copy. Pastels don't clear AA at
   12px; copy stays on --foreground/--subtle/--faint.
   ================================================================== */

export interface DetectionHue {
  /** Tint token, fills, washes, chip backgrounds. */
  fill: string;
  /** Saturated token, strokes, dots, meter fills, small icon glyphs. */
  strong: string;
}

export const DETECTION_HUE: Record<string, DetectionHue> = {
  pothole: {
    fill: "var(--pastel-blush)",
    strong: "var(--pastel-blush-strong)",
  },
  longitudinal_crack: {
    fill: "var(--pastel-sky)",
    strong: "var(--pastel-sky-strong)",
  },
  transverse_crack: {
    fill: "var(--pastel-lavender)",
    strong: "var(--pastel-lavender-strong)",
  },
  alligator_crack: {
    fill: "var(--pastel-peach)",
    strong: "var(--pastel-peach-strong)",
  },
  debris: {
    fill: "var(--pastel-butter)",
    strong: "var(--pastel-butter-strong)",
  },
};

const UNKNOWN_HUE: DetectionHue = {
  fill: "var(--overlay-strong)",
  strong: "var(--faint)",
};

/** Ramp lookup that tolerates any class string coming off the wire. */
export function detectionHue(className: string): DetectionHue {
  return DETECTION_HUE[className] ?? UNKNOWN_HUE;
}

/**
 * Cluster lifecycle → the shared semantic tone vocabulary, so a cluster
 * chip reads the same as every other status chip in the app. `dispatched`
 * is deliberately `info`, matching the report status chip that sits
 * beside it on the same card. The same word must not wear two hues.
 */
export const CLUSTER_TONE: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  candidate: "neutral",
  escalated: "danger",
  dispatched: "info",
  monitoring: "warning",
  dismissed: "neutral",
  merged: "neutral",
};

/** Clip run state → tone, for the recent-clips log. */
export const CLIP_TONE: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  pending: "neutral",
  processing: "info",
  done: "success",
  failed: "danger",
};
