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

const ALLOWED_ROLES = new Set([
  "staff_dispatcher",
  "staff_supervisor",
  "admin",
]);

function storagePath(cityId: string, reportId: string): string {
  return `${cityId}/${reportId}.webp`;
}

/**
 * Generate a 10-minute signed URL for a raw photo.
 *
 * Must be called from a server context (API route / server action) —
 * the service role key is required to sign against the restricted bucket.
 *
 * Internally verifies that `requestingUserId` holds a `staff_dispatcher`,
 * `staff_supervisor`, or `admin` role AND belongs to the same city as the
 * report. Returns `{ ok: false, error: "unauthorized" }` if not.
 */
export async function getSignedRawPhotoUrl(
  reportId: string,
  cityId: string,
  requestingUserId: string
): Promise<Result<string>> {
  const supabase = createServerClient();

  // Verify the requesting user's role and city membership.
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, city_id")
    .eq("id", requestingUserId)
    .single();

  if (userError || !user) {
    return { ok: false, error: "unauthorized" };
  }

  if (!ALLOWED_ROLES.has(user.role) || user.city_id !== cityId) {
    return { ok: false, error: "unauthorized" };
  }

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
