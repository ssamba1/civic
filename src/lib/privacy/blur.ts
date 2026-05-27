/**
 * Client-side blur engine for PII redaction.
 *
 * Strategy (v1 MVP):
 *  - Face detection via the Shape Detection API (`FaceDetector`), available
 *    in Chromium browsers. When unavailable, a conservative fallback blurs
 *    the top third of the image (where faces appear in typical photos).
 *  - License plate detection is not practical without a model, so v1 blurs
 *    the bottom third of the image as a conservative heuristic.
 *  - Both regions receive a heavy gaussian-like blur via CanvasRenderingContext2D.filter.
 *
 * The caller receives { blurred, original } — the original is kept only for
 * the restricted `photos-raw` bucket (30-day TTL, staff-only signed URLs).
 */

export const BLUR_VERSION = 1;

const BLUR_RADIUS = 24; // px — heavy enough to obscure text and features

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
  imageBitmap: ImageBitmap
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
    // API exists but failed (e.g. platform not supported) — fall back
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
    // top third — likely face zone
    { x: 0, y: 0, width: w, height: thirdH },
    // bottom third — likely plate zone
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
  source: ImageBitmap
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
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      type,
      quality
    );
  });
}

/**
 * Primary export. Blurs faces and license plates on the client before upload.
 *
 * @returns `blurred` — the redacted image (goes to `photos-public`)
 *          `original` — untouched copy (goes to `photos-raw`, 30-day TTL)
 */
export async function blurFacesAndPlates(
  imageFile: File
): Promise<{ blurred: Blob; original: Blob }> {
  const bitmap = await createImageBitmap(imageFile);
  const { width, height } = bitmap;

  // --- Build the blurred version ---
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context");

  // Draw the clean image first
  ctx.drawImage(bitmap, 0, 0);

  // Detect faces (or fall back)
  const faces = await detectFaces(bitmap);
  const faceRegions = faces ?? [fallbackRegions(width, height)[0]];

  // Plate regions (always heuristic in v1)
  const plates = plateRegions(width, height);

  // Merge and deduplicate — some fallback regions may overlap
  const allRegions = [...faceRegions, ...plates];

  blurRegions(ctx, allRegions, bitmap);

  const blurred = await canvasToBlob(canvas);

  // The original is just the raw file bytes
  const original = new Blob([await imageFile.arrayBuffer()], {
    type: imageFile.type,
  });

  bitmap.close();

  return { blurred, original };
}
