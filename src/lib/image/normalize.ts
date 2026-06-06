/**
 * Browser-only image normalization helper.
 *
 * `bitmapToJpeg` draws an already-decoded `ImageBitmap` onto a canvas at a
 * bounded size and encodes it as JPEG. The caller is responsible for decoding
 * with EXIF orientation applied — `blur.ts` does this via
 * `createImageBitmap(file, { imageOrientation: "from-image" })` and feeds the
 * upright bitmap here, which bakes orientation into pixels and guarantees a
 * Gemini-supported, correctly-labeled `image/jpeg`.
 *
 * The default `maxEdge` matches the report flow's payload budget (the two
 * base64 images must fit Next's ~1MB Server Action body limit).
 */

const isBrowser = typeof document !== "undefined";

/**
 * Draw an `ImageBitmap` onto a canvas scaled so its long edge is at most
 * `maxEdge`, preserving aspect ratio, then encode as JPEG.
 *
 * @throws if not running in a browser, if a 2D context cannot be obtained, or
 * if canvas encoding yields a null blob.
 */
export async function bitmapToJpeg(
  bitmap: ImageBitmap,
  maxEdge = 1280,
  quality = 0.8,
): Promise<Blob> {
  if (!isBrowser) {
    throw new Error("bitmapToJpeg is only available in the browser");
  }

  const { width, height } = bitmap;
  const longEdge = Math.max(width, height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire 2D canvas context");
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("Canvas failed to produce a JPEG blob");
  }

  return blob;
}
