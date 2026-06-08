/**
 * Dual-bucket upload handler.
 *
 * - `photos-public` — blurred image, permanent, world-readable via RLS
 * - `photos-raw`    — original image, 30-day TTL, restricted to city staff
 *
 * Invariant: no raw photo ever reaches the public bucket.
 */

import { createBrowserSupabase } from "@/lib/db/browser-client";
import { sniffImageMime } from "@/lib/image/sniff-mime";
import type { Result } from "@/lib/types";

const ALLOWED_MIME_TYPES = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/heic",
]);

const PUBLIC_BUCKET = "photos-public";
const RAW_BUCKET = "photos-raw";

function storagePath(cityId: string, reportId: string): string {
  return `${cityId}/${reportId}.webp`;
}

/**
 * Validate MIME type before sending bytes to storage.
 *
 * Two gates: the self-reported `blob.type` allow-list (cheap), then a magic-byte
 * sniff of the leading bytes (authoritative — `blob.type` is browser-inferred
 * from the extension and trivially spoofable by renaming a file).
 */
async function validateMime(blob: Blob, label: string): Promise<Result<void>> {
  if (!ALLOWED_MIME_TYPES.has(blob.type)) {
    return {
      ok: false,
      error: `${label}: rejected MIME type "${blob.type}". Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
    };
  }
  const header = await blob.slice(0, 12).arrayBuffer();
  const sniffed = sniffImageMime(new Uint8Array(header));
  if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) {
    return {
      ok: false,
      error: `${label}: file header does not match an allowed image type`,
    };
  }
  return { ok: true, data: undefined };
}

/**
 * Upload blurred + original photos to their respective buckets.
 *
 * Called from the browser after `blurFacesAndPlates()`.
 *
 * @returns publicUrl  — permanent CDN URL for the blurred image
 *          rawUrl     — storage path for the raw image (actual access via signed URL)
 */
export async function uploadReportPhotos(
  blurred: Blob,
  original: Blob,
  reportId: string,
  cityId: string,
): Promise<Result<{ publicUrl: string; rawUrl: string }>> {
  // Validate MIME types
  const blurCheck = await validateMime(blurred, "blurred");
  if (!blurCheck.ok) return blurCheck;
  const rawCheck = await validateMime(original, "original");
  if (!rawCheck.ok) return rawCheck;

  const supabase = createBrowserSupabase();
  const path = storagePath(cityId, reportId);

  // Upload blurred to public bucket
  const { error: publicErr } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(path, blurred, {
      contentType: "image/webp",
      upsert: false,
    });

  if (publicErr) {
    return { ok: false, error: `Public upload failed: ${publicErr.message}` };
  }

  // Upload original to raw bucket (restricted)
  const { error: rawErr } = await supabase.storage
    .from(RAW_BUCKET)
    .upload(path, original, {
      contentType: original.type,
      upsert: false,
    });

  if (rawErr) {
    // Best-effort cleanup: remove the already-uploaded public file
    await supabase.storage.from(PUBLIC_BUCKET).remove([path]);
    return { ok: false, error: `Raw upload failed: ${rawErr.message}` };
  }

  // Build the public URL for the blurred image
  const {
    data: { publicUrl },
  } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path);

  return {
    ok: true,
    data: {
      publicUrl,
      rawUrl: `${RAW_BUCKET}/${path}`,
    },
  };
}
