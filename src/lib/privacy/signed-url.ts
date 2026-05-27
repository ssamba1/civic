/**
 * Signed URL generation for raw (unblurred) photos.
 *
 * Server-only — uses the service role key to bypass RLS.
 * Raw photos are accessible only by city staff via short-lived signed URLs.
 */

import type { Result } from "@/lib/types";
import { createServerClient } from "@/lib/db/client";

const RAW_BUCKET = "photos-raw";
const SIGNED_URL_EXPIRY_SECONDS = 10 * 60; // 10 minutes

function storagePath(cityId: string, reportId: string): string {
  return `${cityId}/${reportId}.webp`;
}

/**
 * Generate a 10-minute signed URL for a raw photo.
 *
 * Must be called from a server context (API route / server action) —
 * the service role key is required to sign against the restricted bucket.
 *
 * The caller is responsible for verifying the requesting user has the
 * `staff_dispatcher`, `staff_supervisor`, or `admin` role for the given city.
 */
export async function getSignedRawPhotoUrl(
  reportId: string,
  cityId: string
): Promise<Result<string>> {
  const supabase = createServerClient();
  const path = storagePath(cityId, reportId);

  const { data, error } = await supabase.storage
    .from(RAW_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: `Signed URL generation failed: ${error?.message ?? "unknown error"}`,
    };
  }

  return { ok: true, data: data.signedUrl };
}
