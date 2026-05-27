/**
 * Privacy audit utilities.
 *
 * Verifies that no raw (unblurred) photos have leaked into the public bucket.
 * Intended for periodic cron checks and admin dashboard display.
 */

import { createServerClient } from "@/lib/db/client";

const PUBLIC_BUCKET = "photos-public";
const RAW_BUCKET = "photos-raw";

/**
 * Cross-reference public bucket contents against the raw bucket.
 *
 * A "violation" means a file exists in `photos-public` whose exact path
 * also exists in `photos-raw` AND has the same file size — a strong signal
 * that the raw original was uploaded to the public bucket instead of
 * (or in addition to) the blurred version.
 *
 * This is a heuristic: blurred files are always smaller than originals due
 * to information loss from the blur filter, so matching sizes indicate a
 * likely raw-photo leak.
 */
export async function auditPublicBucket(
  cityId: string
): Promise<{ violations: string[] }> {
  const supabase = createServerClient();
  const violations: string[] = [];

  // List all files under this city in the public bucket
  const { data: publicFiles, error: publicErr } = await supabase.storage
    .from(PUBLIC_BUCKET)
    .list(cityId, { limit: 1000 });

  if (publicErr || !publicFiles) {
    violations.push(
      `Could not list public bucket for city ${cityId}: ${publicErr?.message ?? "unknown"}`
    );
    return { violations };
  }

  // For each public file, check if an identical-size file exists in raw
  for (const file of publicFiles) {
    const path = `${cityId}/${file.name}`;

    // Fetch metadata from the raw bucket for comparison
    const { data: rawFiles } = await supabase.storage
      .from(RAW_BUCKET)
      .list(cityId, { limit: 1, search: file.name });

    if (!rawFiles || rawFiles.length === 0) continue;

    const rawFile = rawFiles[0];

    // Size match is a strong indicator the raw file leaked to public
    if (
      rawFile.metadata?.size &&
      file.metadata?.size &&
      rawFile.metadata.size === file.metadata.size
    ) {
      violations.push(
        `Possible raw photo in public bucket: ${path} ` +
          `(public size: ${file.metadata.size}, raw size: ${rawFile.metadata.size})`
      );
    }
  }

  return { violations };
}
