import { DEDUP_RADIUS_M } from "@/lib/ai/config";
import type { createServerClient } from "@/lib/db/client";
import type { createLogger } from "@/lib/logger";

type SupabaseLike = ReturnType<typeof createServerClient>;

export interface DuplicateMatch {
  primaryReportId: string;
  distanceM: number;
  similarityScore: number;
}

/**
 * Find an earlier open report that `reportId` duplicates, same category,
 * within DEDUP_RADIUS_M metres, within the last 30 days. Thin wrapper over the
 * find_duplicate_report RPC (migration 011, geo + category + time matching).
 *
 * Never throws: a missing RPC (un-migrated DB) or any error returns null so the
 * pipeline falls through to normal work-order creation. The demo thread must
 * never break.
 */
export async function findDuplicate(
  supabase: SupabaseLike,
  reportId: string,
  log: ReturnType<typeof createLogger>,
): Promise<DuplicateMatch | null> {
  try {
    const { data, error } = await supabase
      .rpc("find_duplicate_report", {
        _report_id: reportId,
        _radius_m: DEDUP_RADIUS_M,
        _window_days: 30,
      })
      .maybeSingle<{
        primary_report_id: string;
        distance_m: number;
        similarity_score: number;
      }>();

    if (error) {
      // Un-migrated DB (function does not exist) or transient error. Log and
      // fall through to normal processing.
      log.error("dedup_rpc_failed", undefined, {
        reportId,
        error: error.message,
      });
      return null;
    }
    if (!data) return null;

    return {
      primaryReportId: data.primary_report_id,
      distanceM: Number(data.distance_m),
      similarityScore: Number(data.similarity_score),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("dedup_unexpected_error", undefined, {
      reportId,
      error: message,
    });
    return null;
  }
}
