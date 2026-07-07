"use server";

import { after } from "next/server";
// Reuse the canonical 12-category enum so staff overrides aren't limited to the
// original 8-item local list (adds debris/drainage/faded_signage/other).
import { classificationSchema } from "@/lib/ai/classification-schema";
import { generateWorkOrder } from "@/lib/ai/work-order-rules";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { notifyReportStatus } from "@/lib/notify/status-notify";
import { resolveTeamKeyForCategory } from "@/lib/onboarding/city-teams";
import { publicToken } from "@/lib/public-report";
import { TEAMS, type TeamId } from "@/lib/teams";
import type {
  CategoryCostStats,
  Classification,
  ReportCategory,
  Result,
  WorkOrderWithDetails,
} from "@/lib/types";

const logger = createLogger("[staff-actions]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

const ReportCategorySchema = classificationSchema.shape.category;

async function getStaffUser() {
  // C5 fix: use cookie-aware SSR client for auth, service-role client only for DB queries
  const user = await getAuthUser();
  const db = createServerClient();

  if (!user) {
    // Bypass only when DEV_AUTH_BYPASS=1 AND NODE_ENV=development — never in prod.
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

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return null;
  }
  return profile;
}

// City-scope guards. Staff may only act on reports/work orders in their own
// city. The service-role client bypasses RLS, so these SELECT-then-check guards
// are the only thing stopping a staffer in city A from mutating city B's data.
// Fails closed when the staffer has no city_id (null) — no city, no access.
async function reportInStaffCity(
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

async function workOrderInStaffCity(
  db: ReturnType<typeof createServerClient>,
  workOrderId: string,
  cityId: string | null,
): Promise<boolean> {
  if (!cityId) return false;
  // Resolve the work order's parent report city. A dot-filter on the embed
  // would constrain the embedded rows, not which work_order is selected, so we
  // fetch then compare in JS.
  const { data } = await db
    .from("work_orders")
    .select("report:reports!report_id(city_id)")
    .eq("id", workOrderId)
    .maybeSingle();
  const rel = (data as { report?: unknown } | null)?.report;
  const report = (Array.isArray(rel) ? rel[0] : rel) as
    | { city_id?: string }
    | null
    | undefined;
  return report?.city_id === cityId;
}

export async function dispatchWorkOrder(
  workOrderId: string,
  crewId?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();
  if (!(await workOrderInStaffCity(supabase, workOrderId, staff.city_id)))
    return { ok: false, error: "Unauthorized: work order not in your city" };

  const update: Record<string, unknown> = {
    dispatched_at: new Date().toISOString(),
    assigned_crew_id: crewId ?? null,
  };

  // Update and read back report_id in one round-trip so a concurrent
  // mutation/delete can't slip between the write and a follow-up fetch.
  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId)
    .select("report_id")
    .single();

  if (woError) return { ok: false, error: "work_order_not_found" };

  // M9 fix: check error on report status update
  const { error: reportError } = await supabase
    .from("reports")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("id", wo.report_id);
  if (reportError) return { ok: false, error: "status_update_failed" };

  // Out-of-band notify (acknowledged). Non-blocking: a delivery miss must never
  // fail the dispatch the staffer just made.
  after(async () => {
    try {
      await notifyReportStatus(wo.report_id, "dispatched");
    } catch (err) {
      logger.error("Dispatch notification failed", err, {
        reportId: wo.report_id,
      });
    }
  });

  return { ok: true, data: undefined };
}

// Map UI exposes reports, not work orders — resolve the work order by
// report_id (may legitimately not exist yet if classify hasn't created one).
export async function dispatchWorkOrderForReport(
  reportId: string,
  crewId?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();
  if (!(await reportInStaffCity(supabase, reportId, staff.city_id)))
    return { ok: false, error: "Unauthorized: report not in your city" };

  // Verify-then-act: `.update().eq()` reports no error when it matches 0 rows,
  // so without `.select()` a report with no work order would still be flipped
  // to "dispatched" and fire a notification for a work order that doesn't
  // exist. Require the update to have touched a row.
  const { data: updatedWo, error: woError } = await supabase
    .from("work_orders")
    .update({
      dispatched_at: new Date().toISOString(),
      assigned_crew_id: crewId ?? null,
    })
    .eq("report_id", reportId)
    .select("id");
  if (woError) return { ok: false, error: "work_order_update_failed" };
  if (!updatedWo || updatedWo.length === 0)
    return { ok: false, error: "no_work_order_for_report" };

  const { error: reportError } = await supabase
    .from("reports")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("id", reportId);
  if (reportError) return { ok: false, error: "status_update_failed" };

  after(async () => {
    try {
      await notifyReportStatus(reportId, "dispatched");
    } catch (err) {
      logger.error("Dispatch notification failed", err, { reportId });
    }
  });

  return { ok: true, data: undefined };
}

/**
 * Close a work order by its REPORT id — the shape the team task surfaces have
 * (the corpus row carries no work-order id). Resolves the report's work order
 * (unique per report) and delegates to {@link closeWorkOrder}. The photo, when
 * given, arrives as a downscaled data URL and is re-hosted to Storage.
 */
export async function closeReportWorkOrder(
  reportId: string,
  actualCost: number,
  resolutionPhotoDataUrl?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();
  const { data: wo, error } = await supabase
    .from("work_orders")
    .select("id")
    .eq("report_id", reportId)
    .maybeSingle<{ id: string }>();
  if (error || !wo) return { ok: false, error: "work_order_not_found" };

  return closeWorkOrder(wo.id, actualCost, undefined, resolutionPhotoDataUrl);
}

/** Re-host a client-downscaled data-URL photo into the public photos bucket. */
async function uploadResolutionPhoto(
  supabase: ReturnType<typeof createServerClient>,
  cityId: string,
  workOrderId: string,
  dataUrl: string,
): Promise<string | null> {
  const match = /^data:image\/(webp|jpeg|png);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const [, ext, b64] = match;
  // Downscaled client-side to ~1280px; cap the decoded payload defensively.
  if (b64.length > 1_500_000) return null;
  const path = `${cityId}/resolutions/${workOrderId}.${ext === "jpeg" ? "jpg" : ext}`;
  const { error } = await supabase.storage
    .from("photos-public")
    .upload(path, Buffer.from(b64, "base64"), {
      contentType: `image/${ext}`,
      upsert: true,
    });
  if (error) {
    logger.error("resolution_photo_upload_failed", error, { workOrderId });
    return null;
  }
  return supabase.storage.from("photos-public").getPublicUrl(path).data
    .publicUrl;
}

export async function closeWorkOrder(
  workOrderId: string,
  actualCost: number,
  resolutionPhotoUrl?: string,
  resolutionPhotoDataUrl?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  // Validate actual_cost: whole dollars, > 0, <= $5,000,000, max 2 decimal places.
  if (
    !Number.isFinite(actualCost) ||
    actualCost <= 0 ||
    actualCost > 5_000_000 ||
    Math.round(actualCost * 100) !== actualCost * 100
  ) {
    return {
      ok: false,
      error:
        "Actual cost must be a positive dollar amount (max $5,000,000) with up to 2 decimal places",
    };
  }

  const supabase = createServerClient();
  if (!(await workOrderInStaffCity(supabase, workOrderId, staff.city_id)))
    return { ok: false, error: "Unauthorized: work order not in your city" };

  // Compute the outlier flag: reject if actual > 5× the running median for
  // this city+category. Fetch the work order to get report_id + category, then
  // compute the median from accepted actuals.
  const { data: woMeta, error: woMetaErr } = await supabase
    .from("work_orders")
    .select("report_id, reports(city_id), classifications(category)")
    .eq("id", workOrderId)
    .single();

  if (woMetaErr || !woMeta) return { ok: false, error: "work_order_not_found" };

  // PostgREST returns to-one embeds as objects at runtime, but the untyped
  // client infers arrays — normalize both shapes instead of asserting one.
  const rels = woMeta as unknown as {
    reports: { city_id: string } | { city_id: string }[] | null;
    classifications: { category: string } | { category: string }[] | null;
  };
  const reportRel = Array.isArray(rels.reports) ? rels.reports[0] : rels.reports;
  const classificationRel = Array.isArray(rels.classifications)
    ? rels.classifications[0]
    : rels.classifications;
  const cityId = reportRel?.city_id;
  const category = classificationRel?.category;

  let actualCostExcluded = false;
  if (cityId && category) {
    // Fetch existing accepted actuals for this city+category to compute median.
    const { data: existingActuals } = await supabase
      .from("work_orders")
      .select("actual_cost, reports!inner(city_id), classifications!inner(category)")
      .eq("reports.city_id", cityId)
      .eq("classifications.category", category)
      .eq("actual_cost_excluded", false)
      .not("actual_cost", "is", null);

    if (existingActuals && existingActuals.length > 0) {
      const costs = existingActuals
        .map((r) => Number(r.actual_cost))
        .filter((c) => c > 0)
        .sort((a, b) => a - b);
      const mid = Math.floor(costs.length / 2);
      const median =
        costs.length % 2 === 0
          ? (costs[mid - 1] + costs[mid]) / 2
          : costs[mid];
      if (actualCost > 5 * median) {
        actualCostExcluded = true;
        logger.warn("actual_cost_outlier_flagged", {
          workOrderId,
          actualCost,
          median,
          cityId,
          category,
        });
      }
    }
  }

  // Photo can arrive pre-hosted (URL) or as a client-downscaled data URL that
  // we re-host to Storage here (localStorage data URLs never reach the DB).
  let photoUrl = resolutionPhotoUrl ?? null;
  if (!photoUrl && resolutionPhotoDataUrl && cityId) {
    photoUrl = await uploadResolutionPhoto(
      supabase,
      cityId,
      workOrderId,
      resolutionPhotoDataUrl,
    );
  }

  const update: Record<string, unknown> = {
    completed_at: new Date().toISOString(),
    resolution_photo_url: photoUrl,
    actual_cost: actualCost,
    actual_cost_excluded: actualCostExcluded,
  };

  // Update and read back report_id in one round-trip so a concurrent
  // mutation/delete can't slip between the write and a follow-up fetch.
  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId)
    .select("report_id")
    .single();

  if (woError) return { ok: false, error: "work_order_not_found" };

  // M9 fix: check error on report status update
  const { error: reportError } = await supabase
    .from("reports")
    .update({
      status: "closed",
      public_token: publicToken(wo.report_id),
      updated_at: new Date().toISOString(),
    })
    .eq("id", wo.report_id);
  if (reportError) return { ok: false, error: "status_update_failed" };

  // Append-only timeline row (migration 025) — feeds the resident timeline and
  // the Open311 service-request-updates projection. Best-effort: the close
  // itself already committed.
  const { error: updateRowErr } = await supabase.from("report_updates").insert({
    report_id: wo.report_id,
    status: "closed",
    note: "Work completed and the report closed out.",
    photo_url: photoUrl,
    actor: "staff",
  });
  if (updateRowErr) {
    logger.error("report_updates_insert_failed", updateRowErr, {
      reportId: wo.report_id,
    });
  }

  // The lever: resolved notification carries the resolution photo. Non-blocking.
  after(async () => {
    try {
      await notifyReportStatus(wo.report_id, "closed");
    } catch (err) {
      logger.error("Close notification failed", err, {
        reportId: wo.report_id,
      });
    }
  });

  return { ok: true, data: undefined };
}

export async function rejectReport(
  reportId: string,
  reason: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  if (!reason.trim()) return { ok: false, error: "Rejection reason required" };

  const supabase = createServerClient();
  if (!(await reportInStaffCity(supabase, reportId, staff.city_id)))
    return { ok: false, error: "Unauthorized: report not in your city" };

  const { error } = await supabase
    .from("reports")
    .update({
      status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) return { ok: false, error: error.message };

  after(async () => {
    try {
      await notifyReportStatus(reportId, "rejected");
    } catch (err) {
      logger.error("Reject notification failed", err, { reportId });
    }
  });

  return { ok: true, data: undefined };
}

export async function overrideClassification(
  reportId: string,
  newCategory: ReportCategory,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  // H9 fix: validate category against known enum values before DB write
  const parsed = ReportCategorySchema.safeParse(newCategory);
  if (!parsed.success) return { ok: false, error: "invalid_category" };

  const supabase = createServerClient();
  if (!(await reportInStaffCity(supabase, reportId, staff.city_id)))
    return { ok: false, error: "Unauthorized: report not in your city" };

  // Fetch the current classification so we can record what was overridden and
  // re-derive routing. select("*") gives the full row we can spread into a
  // Classification for the rules engine below.
  const { data: existing } = await supabase
    .from("classifications")
    .select("*")
    .eq("report_id", reportId)
    .single<Classification>();

  const categoryChanged = !!existing && existing.category !== parsed.data;

  // Persist feedback whenever the staff member picks a different category.
  // Check the insert result: a swallowed error silently loses the training
  // signal the classifier is meant to learn from.
  if (categoryChanged) {
    const { error: feedbackError } = await supabase
      .from("classification_feedback")
      .insert({
        report_id: reportId,
        staff_id: staff.id,
        original_category: existing.category,
        corrected_category: parsed.data,
        original_confidence: existing.confidence,
      });
    if (feedbackError)
      logger.error("classification_feedback insert failed", feedbackError, {
        reportId,
      });
  }

  const { error } = await supabase
    .from("classifications")
    .update({ category: parsed.data })
    .eq("report_id", reportId);

  if (error) return { ok: false, error: error.message };

  // Re-route the work order to the NEW category's department/crew. Without this
  // the WO stays routed to the OLD department (e.g. an override from pothole →
  // water_leak would leave it with public_works/paving instead of
  // utilities/line_crew) and the wrong crew gets dispatched. Deterministic
  // rules-based reroute; priority_score is severity-driven and unchanged, so we
  // leave it. Best-effort: a report with no work order yet matches 0 rows.
  // Best-effort and fully guarded: the category override above has already
  // committed, so nothing here may throw and turn a successful override into a
  // 500. (generateWorkOrder is total over ReportCategory today, but wrap it so a
  // future RULES/enum drift — or a transient DB error on the update — can't
  // resurrect the post-commit divergent state T1.1 was about.)
  if (categoryChanged) {
    try {
      const routed = generateWorkOrder(
        { ...existing, category: parsed.data },
        { recurrenceCount: 0 },
      );
      const teamKey = await resolveTeamKeyForCategory(
        staff.city_id,
        parsed.data,
      );
      const { error: rerouteError } = await supabase
        .from("work_orders")
        .update({
          department: routed.department,
          crew_type: routed.crew_type,
          est_minutes: routed.est_minutes,
          materials: routed.materials,
          team_key: teamKey,
        })
        .eq("report_id", reportId);
      if (rerouteError)
        logger.error("work order reroute after override failed", rerouteError, {
          reportId,
        });
    } catch (err) {
      logger.error("work order reroute threw after override", err, { reportId });
    }
  }

  return { ok: true, data: undefined };
}

export async function markUnderFix(
  workOrderId: string,
  costEstimate: number | null,
  timeDays: number | null,
  note: string | null,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();
  if (!(await workOrderInStaffCity(supabase, workOrderId, staff.city_id)))
    return { ok: false, error: "Unauthorized: work order not in your city" };

  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .update({
      fix_cost_estimate: costEstimate,
      fix_time_estimate_days: timeDays,
      fix_note: note?.trim() || null,
      marked_under_fix_at: new Date().toISOString(),
    })
    .eq("id", workOrderId)
    .select("report_id")
    .single();

  if (woError) return { ok: false, error: "work_order_not_found" };

  const { error: reportError } = await supabase
    .from("reports")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", wo.report_id);
  if (reportError) return { ok: false, error: "status_update_failed" };

  after(async () => {
    try {
      await notifyReportStatus(wo.report_id, "in_progress");
    } catch (err) {
      logger.error("Under-fix notification failed", err, {
        reportId: wo.report_id,
      });
    }
  });

  return { ok: true, data: undefined };
}

export async function addWorkOrderComment(
  workOrderId: string,
  body: string,
): Promise<Result<{ id: string }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > 2000)
    return { ok: false, error: "invalid_body" };

  const supabase = createServerClient();
  if (!(await workOrderInStaffCity(supabase, workOrderId, staff.city_id)))
    return { ok: false, error: "Unauthorized: work order not in your city" };

  const { data, error } = await supabase
    .from("work_order_comments")
    .insert({
      work_order_id: workOrderId,
      author_id: staff.id,
      body: trimmed,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}

/**
 * Fetches work orders created after `afterTimestamp` (ISO string).
 * Used by the staff inbox refresh queue – new reports accumulate here
 * and are only shown when the admin clicks Refresh.
 */
export async function fetchQueuedWorkOrders(
  afterTimestamp: string,
): Promise<
  | { ok: true; data: WorkOrderWithDetails[]; fetchedAt: string }
  | { ok: false; error: string }
> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized" };

  const db = createServerClient();

  const { data, error } = await db
    .from("work_orders")
    .select(
      `
      *,
      reports!report_id (
        id,
        city_id,
        reporter_id,
        location,
        photo_public_url,
        photo_raw_url,
        status,
        address,
        description,
        created_at,
        updated_at,
        classifications (
          category,
          subcategory,
          severity,
          hazard_radius_m,
          visible_size_estimate,
          is_emergency,
          confidence,
          reasoning,
          no_issue_detected,
          alternate_categories
        )
      )
    `,
    )
    .eq("reports.city_id", staff.city_id)
    .gt("created_at", afterTimestamp)
    .order("priority_score", { ascending: false });

  if (error) return { ok: false, error: error.message };

  // Capture server-side query time so callers can advance poll cursors without
  // relying on client clocks (avoids skew between browser and DB server).
  const fetchedAt = new Date().toISOString();

  const result = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const report = Array.isArray(row.reports)
        ? row.reports[0]
        : (row.reports as Record<string, unknown> | null);
      if (!report) return null;

      const classificationsRaw = report.classifications;
      const classification = Array.isArray(classificationsRaw)
        ? (classificationsRaw[0] ?? null)
        : (classificationsRaw ?? null);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { reports: _reports, ...rest } = row as Record<string, unknown> & {
        reports: unknown;
      };

      return {
        ...rest,
        report: {
          id: report.id,
          city_id: report.city_id,
          reporter_id: report.reporter_id,
          location: report.location,
          photo_public_url: report.photo_public_url,
          photo_raw_url: report.photo_raw_url ?? null,
          status: report.status,
          address: report.address ?? null,
          description: report.description ?? null,
          created_at: report.created_at,
          updated_at: report.updated_at,
        },
        classification,
      };
    })
    .filter(Boolean) as WorkOrderWithDetails[];

  return { ok: true, data: result, fetchedAt };
}


export async function fetchCategoryCostStats(
  cityId: string,
): Promise<Result<CategoryCostStats[]>> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("category_cost_stats", {
    _city_id: cityId,
  });
  if (error) {
    logger.warn("category_cost_stats RPC failed (un-migrated?)", { error: error.message });
    return { ok: true, data: [] };
  }
  return { ok: true, data: (data ?? []) as CategoryCostStats[] };
}

/**
 * Upsert a dispatcher-defined issue type for the staff member's city (the DB
 * leg of the custom-categories store; issue_types, migration 027).
 */
export async function saveIssueType(input: {
  key: string;
  label: string;
  color: string;
  teamKey: TeamId;
}): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id) return { ok: false, error: "no_city" };
  if (!(input.teamKey in TEAMS) || input.teamKey === "all")
    return { ok: false, error: "invalid_team" };
  const key = input.key.trim();
  const label = input.label.trim();
  if (!/^custom_[a-z0-9_]{1,64}$/.test(key) || !label || label.length > 80)
    return { ok: false, error: "invalid_issue_type" };

  const supabase = createServerClient();
  const { error } = await supabase.from("issue_types").upsert(
    {
      city_id: staff.city_id,
      key,
      label,
      color: input.color,
      team_key: input.teamKey,
    },
    { onConflict: "city_id,key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/** Delete a dispatcher-defined issue type for the staff member's city. */
export async function deleteIssueType(key: string): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id) return { ok: false, error: "no_city" };

  const supabase = createServerClient();
  const { error } = await supabase
    .from("issue_types")
    .delete()
    .eq("city_id", staff.city_id)
    .eq("key", key.trim());
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/**
 * Reassign one report's work order to another team (the DB leg of the
 * delegation panel — the localStorage overlay stays as the instant-UI layer).
 */
export async function reassignReportTeam(
  reportId: string,
  teamKey: TeamId,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!(teamKey in TEAMS) || teamKey === "all")
    return { ok: false, error: "invalid_team" };

  const supabase = createServerClient();
  if (!(await reportInStaffCity(supabase, reportId, staff.city_id)))
    return { ok: false, error: "Unauthorized: report not in your city" };

  const { data: wo, error } = await supabase
    .from("work_orders")
    .update({ team_key: teamKey })
    .eq("report_id", reportId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!wo) return { ok: false, error: "work_order_not_found" };
  return { ok: true, data: undefined };
}

/**
 * Move a category's default routing to another team for the staff member's
 * city (the DB leg of the routing matrix; city_teams is the source of truth
 * new work orders resolve against). Removes the category from every other
 * team row, then adds it to the target — creating the row from the preset
 * catalog if the city never enabled that team.
 */
export async function updateCityRouting(
  category: ReportCategory,
  teamKey: TeamId,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id) return { ok: false, error: "no_city" };
  if (!(teamKey in TEAMS) || teamKey === "all")
    return { ok: false, error: "invalid_team" };
  const parsedCategory = ReportCategorySchema.safeParse(category);
  if (!parsedCategory.success) return { ok: false, error: "invalid_category" };

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from("city_teams")
    .select("id, team_key, categories")
    .eq("city_id", staff.city_id);
  if (error) return { ok: false, error: error.message };

  for (const row of rows ?? []) {
    const cats = (row.categories ?? []) as ReportCategory[];
    const isTarget = row.team_key === teamKey;
    const has = cats.includes(parsedCategory.data);
    const next = isTarget
      ? has
        ? cats
        : [...cats, parsedCategory.data]
      : cats.filter((c) => c !== parsedCategory.data);
    if (next.length === cats.length && (isTarget ? has : true)) continue;
    const { error: updateErr } = await supabase
      .from("city_teams")
      .update({ categories: next })
      .eq("id", row.id);
    if (updateErr) return { ok: false, error: updateErr.message };
  }

  if (!(rows ?? []).some((r) => r.team_key === teamKey)) {
    const meta = TEAMS[teamKey];
    const { error: insertErr } = await supabase.from("city_teams").insert({
      city_id: staff.city_id,
      team_key: teamKey,
      label: meta.label,
      enabled: true,
      categories: [parsedCategory.data],
    });
    if (insertErr) return { ok: false, error: insertErr.message };
  }

  return { ok: true, data: undefined };
}
