/**
 * Client-side blur engine for PII redaction.
 *
 * Strategy (v1 MVP):
 *  - Face detection via the Shape Detection API (`FaceDetector`). This API is
 *    EXPERIMENTAL and absent on the most common targets, iOS Safari, Firefox,
 *    and Chrome without the flag, so for a mobile-first audience the fallback
 *    below is effectively the primary path, not the exception.
 *  - Fallback (no detector): blur the top third (typical face zone). License
 *    plates can't be detected without a model, so v1 always blurs the bottom
 *    third as a conservative heuristic.
 *  - Both regions get a heavy blur via CanvasRenderingContext2D.filter.
 *
 * KNOWN LIMITATION (tracked, see docs/planning/fcamera-ai-pipeline-plan.md): with
 * no detector the MIDDLE third is not blurred, so a centre-framed face can reach
 * the public `photos-public` bucket unredacted. Tightening this is a privacy-vs-
 * visibility product call. Fully blurring the frame would hide the reported
 * issue, so it is deliberately left as a flagged decision rather than silently
 * changed here.
 *
 * The caller receives { blurred, original }. The original (an orientation-baked
 * JPEG) is kept only for the restricted `photos-raw` bucket (staff-only).
 */

import { bitmapToJpeg } from "@/lib/image/normalize";

export const BLUR_VERSION = 1;

const BLUR_RADIUS = 24; // px, heavy enough to obscure text and features

// Bounded long-edge for the encoded outputs. Both base64 blobs (blurred WebP +
// original JPEG) are sent through a single Server Action request, which is
// capped at Next's 1MB default (serverActions.bodySizeLimit is not configured,
// and next.config is out of scope to change). A full-resolution phone photo's
// two blobs routinely blow past 1MB and the action body is rejected, which the
// client masks as a fake-success "thanks" screen (silent data loss). Capping
// the long edge here keeps both encodes comfortably under the limit.
const MAX_OUTPUT_EDGE = 1280;
const BLURRED_WEBP_QUALITY = 0.8;
const ORIGINAL_JPEG_QUALITY = 0.8;

interface DetectedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Attempt face detection via the Shape Detection API.
 * Returns detected face bounding boxes, or null if the API is unavailable.
 */
async function detectFaces(
  imageBitmap: ImageBitmap,
): Promise<DetectedRegion[] | null> {
  if (typeof FaceDetector === "undefined") return null;

  try {
    const detector = new FaceDetector({ maxDetectedFaces: 20, fastMode: true });
    const faces = await detector.detect(imageBitmap);
    return faces.map((f) => ({
      x: f.boundingBox.x,
      y: f.boundingBox.y,
      width: f.boundingBox.width,
      height: f.boundingBox.height,
    }));
  } catch {
    // API exists but failed (e.g. platform not supported). Fall back
    return null;
  }
}

/**
 * Conservative fallback regions when native detection is unavailable.
 * Blurs the top third (faces) and bottom third (plates) of the image.
 */
function fallbackRegions(w: number, h: number): DetectedRegion[] {
  const thirdH = Math.round(h / 3);
  return [
    // top third, likely face zone
    { x: 0, y: 0, width: w, height: thirdH },
    // bottom third, likely plate zone
    { x: 0, y: h - thirdH, width: w, height: thirdH },
  ];
}

/**
 * Plate heuristic regions. In a typical street-level photo the plate sits
 * in the lower portion. We blur the bottom third as a conservative default.
 */
function plateRegions(w: number, h: number): DetectedRegion[] {
  const thirdH = Math.round(h / 3);
  return [{ x: 0, y: h - thirdH, width: w, height: thirdH }];
}

/**
 * Apply a heavy blur to the given regions on a canvas.
 * Uses the CSS `filter` property on the 2D context (supported in all modern browsers).
 */
function blurRegions(
  ctx: CanvasRenderingContext2D,
  regions: DetectedRegion[],
  source: ImageBitmap,
): void {
  for (const r of regions) {
    // Pad the region by 10 % to account for detection box tightness
    const pad = Math.round(Math.max(r.width, r.height) * 0.1);
    const sx = Math.max(0, r.x - pad);
    const sy = Math.max(0, r.y - pad);
    const sw = Math.min(source.width - sx, r.width + pad * 2);
    const sh = Math.min(source.height - sy, r.height + pad * 2);

    ctx.save();
    ctx.filter = `blur(${BLUR_RADIUS}px)`;
    // Clip to the region so blur doesn't spill
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    // Redraw the source region with the blur filter active
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }
}

/**
 * Convert a canvas to a WebP blob.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/webp",
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("toBlob returned null")),
      type,
      quality,
    );
  });
}

/**
 * Primary export. Blurs faces and license plates on the client before upload.
 *
 * @returns `blurred`. The redacted WebP (goes to `photos-public`)
 *          `original`. An orientation-corrected JPEG (goes to `photos-raw`,
 *          30-day TTL). NOT a raw passthrough: EXIF orientation is baked into
 *          pixels and the output is guaranteed `image/jpeg`, so the downstream
 *          classifier always receives an upright, correctly-labeled image.
 */
export async function blurFacesAndPlates(
  imageFile: File | Blob,
): Promise<{ blurred: Blob; original: Blob }> {
  // Decode once with EXIF orientation applied. The same upright bitmap feeds
  // both the blurred canvas and the re-encoded original.
  const bitmap = await createImageBitmap(imageFile, {
    imageOrientation: "from-image",
  });
  const { width, height } = bitmap;

  // --- Build the blurred version ---
  // Downscale the blurred canvas to the same bounded long-edge as the original
  // so the encoded WebP fits the 1MB Server Action body limit. All blur math
  // below stays in source-bitmap pixel space; a uniform ctx.scale() transform
  // maps every draw (base image + per-region clips) onto the bounded canvas.
  const longEdge = Math.max(width, height);
  const scale = longEdge > MAX_OUTPUT_EDGE ? MAX_OUTPUT_EDGE / longEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context");
  // Scale ALL subsequent drawing from source px -> bounded canvas px.
  ctx.scale(scale, scale);

  // Draw the clean image first
  ctx.drawImage(bitmap, 0, 0);

  // Detect faces (or fall back)
  const faces = await detectFaces(bitmap);
  const faceRegions =
    faces && faces.length > 0 ? faces : [fallbackRegions(width, height)[0]];

  // Plate regions (always heuristic in v1)
  const plates = plateRegions(width, height);

  // Merge and deduplicate. Some fallback regions may overlap
  const allRegions = [...faceRegions, ...plates];

  blurRegions(ctx, allRegions, bitmap);

  const blurred = await canvasToBlob(
    canvas,
    "image/webp",
    BLURRED_WEBP_QUALITY,
  );

  // Re-encode the original as an orientation-baked JPEG. Long edge capped at
  // MAX_OUTPUT_EDGE (lowered from 2048 -> 1280, quality 0.9 -> 0.8) so the
  // base64 original fits the 1MB Server Action body limit alongside the blurred
  // WebP. Still ample resolution for the downstream classifier. Done BEFORE
  // closing the bitmap, since bitmapToJpeg draws from it and does not close it.
  const original = await bitmapToJpeg(
    bitmap,
    MAX_OUTPUT_EDGE,
    ORIGINAL_JPEG_QUALITY,
  );

  bitmap.close();

  return { blurred, original };
}
