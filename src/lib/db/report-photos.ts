import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { ReportPhoto } from "@/lib/types";

const logger = createLogger("[report-photos]");

/**
 * Fetch all photos for a report ordered by idx, gracefully returning [] when:
 * - the report_photos table hasn't been applied yet (migration 050 not deployed)
 * - the report has no child rows (single-photo submissions before #18)
 * - any unexpected query error
 */
export async function getReportPhotos(reportId: string): Promise<ReportPhoto[]> {
  const service = createServerClient();
  try {
    const { data, error } = await service
      .from("report_photos")
      .select("id, report_id, idx, public_url, raw_url, phash, blur_version, created_at")
      .eq("report_id", reportId)
      .order("idx", { ascending: true });

    if (error) {
      // Table-not-found (42P01) is expected on DBs that haven't run migration 050 yet.
      // Any other error is worth warning about but we still degrade gracefully.
      logger.warn("getReportPhotos: query failed (degrade to [])", {
        reportId,
        code: error.code,
        message: error.message,
      });
      return [];
    }

    return (data ?? []) as ReportPhoto[];
  } catch (err) {
    logger.warn("getReportPhotos: unexpected error (degrade to [])", { reportId, err });
    return [];
  }
}

/**
 * Build upload/storage paths for a multi-photo submission.
 *
 * Returns an array of `count` entries, each with:
 *   publicPath: `${cityId}/${reportId}/${i}.webp`  → photos-public bucket
 *   rawPath:    `${cityId}/${reportId}/${i}.jpg`   → photos-raw bucket
 *
 * Index 0 is the primary photo (mirrors reports.photo_public_url / photo_raw_url).
 *
 * @param cityId  - UUID of the city (folder prefix, matches the single-photo convention)
 * @param reportId - UUID of the report
 * @param count   - number of photos (1–6)
 */
export function buildPhotoPaths(
  cityId: string,
  reportId: string,
  count: number,
): Array<{ publicPath: string; rawPath: string }> {
  const paths: Array<{ publicPath: string; rawPath: string }> = [];
  for (let i = 0; i < count; i++) {
    paths.push({
      publicPath: `${cityId}/${reportId}/${i}.webp`,
      rawPath: `${cityId}/${reportId}/${i}.jpg`,
    });
  }
  return paths;
}
