/**
 * Downscale an image File to a JPEG data URL bounded by `maxEdge` px on its
 * longest side. A full-resolution phone photo (~3-8 MB base64) would blow the
 * ~5 MB localStorage origin quota; downscaling to ~1280px / q0.7 lands around
 * ~150 KB so an after-photo persists across reloads without QuotaExceededError.
 *
 * Client-only (needs canvas + createImageBitmap). Throws if the 2D context is
 * unavailable; callers should fall back to marking done without a photo.
 */
export async function downscaleImageToDataUrl(
  file: File,
  maxEdge = 1280,
  quality = 0.7,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close?.();
  }
}
