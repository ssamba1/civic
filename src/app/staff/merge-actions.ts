"use server";

/**
 * Staff duplicate-merge server actions.
 *
 * Auth: all actions require a staff user (same getStaffUser guard as
 * src/app/staff/actions.ts). Service-role client bypasses RLS; city-scope
 * guards are enforced manually (same pattern as staff/actions.ts).
 *
 * Graceful degrade: if the DB is unavailable (owner-held DATABASE_URL) every
 * action returns { ok: false, error: "db_unavailable" } rather than throwing.
 */

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import {
  canMerge,
  type ReportForMerge,
  rankDuplicateCandidates,
  type ScoredCandidate,
} from "@/lib/staff/merge";
import type { Result } from "@/lib/types";

const logger = createLogger("[merge-actions]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

// ─── Auth guard (mirrors staff/actions.ts getStaffUser exactly) ───────────────

async function getStaffUser() {
  const user = await getAuthUser();
  const db = createServerClient();

  if (!user) {
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DEV_AUTH_BYPASS === "1"
    ) {
      const { data: devStaff } = await db
        .from("users")
        .select("id, role, city_id")
        .in("role", [...STAFF_ROLES])
        .limit(1)
        .single();
      return devStaff && STAFF_ROLES.includes(devStaff.role) ? devStaff : null;
    }
    return null;
  }

  const { data: profile } = await db
    .from("users")
    .select("id, role, city_id")
    .eq("id", user.id)
    .single();

  if (!profile || !STAFF_ROLES.includes(profile.role)) return null;
  return profile;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _reportInStaffCity(
  db: ReturnType<typeof createServerClient>,
  reportId: string,
  cityId: string | null,
): Promise<boolean> {
  if (!cityId) return false;
  const { data } = await db
    .from("reports")
    .select("id")
    .eq("id", reportId)
    .eq("city_id", cityId)
    .maybeSingle();
  return !!data;
}

// ─── findDuplicateCandidates ──────────────────────────────────────────────────

/**
 * Return ranked duplicate candidates for a given report.
 *
 * Uses the `find_staff_duplicate_candidates` PostGIS RPC (defined in migration
 * 052) for geo + phash + category retrieval, then ranks client-side via
 * `rankDuplicateCandidates` for richer weighting.
 *
 * Gracefully degrades to [] if the DB is unreachable or RPC unavailable.
 */
export async function findDuplicateCandidates(
  reportId: string,
): Promise<Result<ScoredCandidate[]>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const db = createServerClient();

  // Fetch the target report for scoring context.
  const { data: target, error: targetError } = await db
    .from("reports")
    .select(
      "id, city_id, photo_phash, category:classifications(category), created_at, address, status, merged_into",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (targetError) {
    logger.warn("Failed to fetch target report", {
      error: targetError.message,
    });
    return { ok: true, data: [] };
  }
  if (!target) return { ok: false, error: "Report not found" };

  // City-scope guard — fail closed on null city_id (actions.ts convention).
  if (!staff.city_id || target.city_id !== staff.city_id) {
    return { ok: false, error: "Unauthorized: report not in your city" };
  }

  // Call the PostGIS RPC.
  const { data: rows, error: rpcError } = await db.rpc(
    "find_staff_duplicate_candidates",
    {
      _report_id: reportId,
      _radius_m: 200,
      _window_days: 90,
    },
  );

  if (rpcError) {
    // RPC may not yet be deployed (owner-held DB) — graceful degrade.
    logger.warn("find_staff_duplicate_candidates RPC failed", {
      error: rpcError.message,
    });
    return { ok: true, data: [] };
  }

  // Resolve classification join (Supabase returns array or object).
  const targetCategoryRaw = target.category;
  const targetCategory = Array.isArray(targetCategoryRaw)
    ? ((targetCategoryRaw[0] as { category?: string } | undefined)?.category ??
      null)
    : ((targetCategoryRaw as { category?: string } | null)?.category ?? null);

  const candidates: ReportForMerge[] = (rows ?? []).map(
    (row: {
      candidate_id: string;
      distance_m: number;
      photo_phash: string | null;
      category: string | null;
      address: string | null;
      created_at: string;
    }) => ({
      id: row.candidate_id,
      city_id: target.city_id,
      distance_m: row.distance_m,
      photo_phash: row.photo_phash,
      category: row.category,
      address: row.address,
      created_at: row.created_at,
      merged_into: null, // candidates excluded by RPC WHERE clause
      status: "open",
    }),
  );

  const ranked = rankDuplicateCandidates(
    {
      photo_phash: target.photo_phash ?? null,
      category: targetCategory,
      created_at: target.created_at,
    },
    candidates,
  );

  return { ok: true, data: ranked };
}

// ─── mergeReports ─────────────────────────────────────────────────────────────

/**
 * Merge `mergedId` into `canonicalId`.
 *
 * 1. Validates via `canMerge` guard.
 * 2. Writes a `report_merges` audit row.
 * 3. Sets `reports.merged_into = canonicalId` and `status = 'merged'` on the merged report.
 * 4. Best-effort: moves `report_upvotes` rows to the canonical report (skipped
 *    if the upvotes table doesn't exist or a constraint fires — the merge still succeeds).
 */
export async function mergeReports(
  canonicalId: string,
  mergedId: string,
  reason: string,
): Promise<Result<{ mergeId: string }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const db = createServerClient();

  // Fetch both reports for guard checks.
  const { data: reports, error: fetchError } = await db
    .from("reports")
    .select("id, city_id, status, merged_into")
    .in("id", [canonicalId, mergedId]);

  if (fetchError) {
    logger.error("Failed to fetch reports for merge", {
      error: fetchError.message,
    });
    return { ok: false, error: "db_unavailable" };
  }

  const canonical = reports?.find((r) => r.id === canonicalId);
  const merged = reports?.find((r) => r.id === mergedId);

  if (!canonical) return { ok: false, error: "Canonical report not found" };
  if (!merged) return { ok: false, error: "Merged report not found" };

  // City-scope guard (service-role bypasses RLS; manual check required).
  // Fail closed on null city_id, and verify BOTH reports belong to the
  // staffer's city — otherwise a staffer could pull a foreign-city report into
  // one of their own (canMerge also blocks cross-city, this is defense in depth).
  if (
    !staff.city_id ||
    canonical.city_id !== staff.city_id ||
    merged.city_id !== staff.city_id
  ) {
    return { ok: false, error: "Unauthorized: report not in your city" };
  }

  const guard = canMerge(
    {
      id: canonical.id,
      city_id: canonical.city_id,
      merged_into: canonical.merged_into,
      status: canonical.status,
    },
    {
      id: merged.id,
      city_id: merged.city_id,
      merged_into: merged.merged_into,
      status: merged.status,
    },
  );
  if (!guard.ok) return { ok: false, error: guard.error };

  // Write audit record.
  const { data: mergeRow, error: auditError } = await db
    .from("report_merges")
    .insert({
      canonical_report_id: canonicalId,
      merged_report_id: mergedId,
      merged_by: staff.id,
      reason,
    })
    .select("id")
    .single();

  if (auditError) {
    logger.error("Failed to insert report_merges row", {
      error: auditError.message,
    });
    return { ok: false, error: "db_unavailable" };
  }

  // Mark the merged report.
  const { error: updateError } = await db
    .from("reports")
    .update({ status: "merged", merged_into: canonicalId })
    .eq("id", mergedId);

  if (updateError) {
    logger.error("Failed to update merged report status", {
      error: updateError.message,
    });
    // Best-effort rollback of the audit row.
    await db.from("report_merges").delete().eq("id", mergeRow.id);
    return { ok: false, error: "db_unavailable" };
  }

  // Best-effort upvote transfer: reassign upvotes that would collide on a
  // hypothetical unique constraint by deleting them on the merged side first,
  // then updating the remainder.
  try {
    // Delete any upvote rows on the merged report where the same user already
    // upvoted the canonical (would violate unique(report_id, user_id)).
    await db.rpc("transfer_upvotes_on_merge" as string, {
      _from_report_id: mergedId,
      _to_report_id: canonicalId,
    });
  } catch {
    // transfer_upvotes_on_merge RPC may not exist — fallback: direct update,
    // ignoring conflicts (best-effort, non-fatal).
    try {
      await db
        .from("report_upvotes" as string)
        .update({ report_id: canonicalId })
        .eq("report_id", mergedId);
    } catch {
      // Non-fatal: upvotes stay on merged report, harmless since report is merged.
      logger.warn("Upvote transfer skipped (best-effort)", {
        canonicalId,
        mergedId,
      });
    }
  }

  logger.info("Reports merged", { canonicalId, mergedId, by: staff.id });
  return { ok: true, data: { mergeId: mergeRow.id } };
}

// ─── unmergeReports ───────────────────────────────────────────────────────────

/**
 * Reverse a prior merge on `mergedId`.
 *
 * Clears `merged_into` and resets status to 'open', and deletes the audit row.
 * Does NOT move upvotes back (impractical — the data no longer tracks origin).
 */
export async function unmergeReports(mergedId: string): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const db = createServerClient();

  const { data: report, error: fetchError } = await db
    .from("reports")
    .select("id, city_id, status, merged_into")
    .eq("id", mergedId)
    .maybeSingle();

  if (fetchError) return { ok: false, error: "db_unavailable" };
  if (!report) return { ok: false, error: "Report not found" };

  if (staff.city_id && report.city_id !== staff.city_id) {
    return { ok: false, error: "Unauthorized: report not in your city" };
  }

  if (report.status !== "merged" && !report.merged_into) {
    return { ok: false, error: "Report is not currently merged" };
  }

  // Clear merged state.
  const { error: updateError } = await db
    .from("reports")
    .update({ status: "open", merged_into: null })
    .eq("id", mergedId);

  if (updateError) {
    logger.error("Failed to unmerge report", { error: updateError.message });
    return { ok: false, error: "db_unavailable" };
  }

  // Delete audit record (best-effort — non-fatal if already gone).
  await db.from("report_merges").delete().eq("merged_report_id", mergedId);

  logger.info("Report unmerged", { mergedId, by: staff.id });
  return { ok: true, data: undefined };
}
