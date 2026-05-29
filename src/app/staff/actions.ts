"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import type { Result, ReportCategory, WorkOrderWithDetails } from "@/lib/types";

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

const ReportCategorySchema = z.enum([
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
]);

async function getStaffUser() {
  // C5 fix: use cookie-aware SSR client for auth, service-role client only for DB queries
  const user = await getAuthUser();
  if (!user) return null;

  const db = createServerClient();
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

export async function dispatchWorkOrder(
  workOrderId: string,
  crewId?: string
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();

  const update: Record<string, unknown> = {
    dispatched_at: new Date().toISOString(),
    assigned_crew_id: crewId ?? null,
  };

  const { error: woError } = await supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId);

  if (woError) return { ok: false, error: woError.message };

  // Also update the linked report status
  const { data: wo } = await supabase
    .from("work_orders")
    .select("report_id")
    .eq("id", workOrderId)
    .single();

  if (wo) {
    // M9 fix: check error on report status update
    const { error: reportError } = await supabase
      .from("reports")
      .update({ status: "dispatched", updated_at: new Date().toISOString() })
      .eq("id", wo.report_id);
    if (reportError) return { ok: false, error: "status_update_failed" };
  }

  return { ok: true, data: undefined };
}

export async function closeWorkOrder(
  workOrderId: string,
  resolutionPhotoUrl?: string
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();

  const update: Record<string, unknown> = {
    completed_at: new Date().toISOString(),
    resolution_photo_url: resolutionPhotoUrl ?? null,
  };

  const { error: woError } = await supabase
    .from("work_orders")
    .update(update)
    .eq("id", workOrderId);

  if (woError) return { ok: false, error: woError.message };

  const { data: wo } = await supabase
    .from("work_orders")
    .select("report_id")
    .eq("id", workOrderId)
    .single();

  if (wo) {
    // M9 fix: check error on report status update
    const { error: reportError } = await supabase
      .from("reports")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", wo.report_id);
    if (reportError) return { ok: false, error: "status_update_failed" };
  }

  return { ok: true, data: undefined };
}

export async function rejectReport(
  reportId: string,
  reason: string
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  if (!reason.trim()) return { ok: false, error: "Rejection reason required" };

  const supabase = createServerClient();

  const { error } = await supabase
    .from("reports")
    .update({
      status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}

export async function overrideClassification(
  reportId: string,
  newCategory: ReportCategory
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  // H9 fix: validate category against known enum values before DB write
  const parsed = ReportCategorySchema.safeParse(newCategory);
  if (!parsed.success) return { ok: false, error: "invalid_category" };

  const supabase = createServerClient();

  // Fetch the current classification so we can record what was overridden
  const { data: existing } = await supabase
    .from("classifications")
    .select("category, confidence")
    .eq("report_id", reportId)
    .single();

  // Persist feedback whenever the staff member picks a different category
  if (existing && existing.category !== parsed.data) {
    await supabase.from("classification_feedback").insert({
      report_id: reportId,
      staff_id: staff.id,
      original_category: existing.category,
      corrected_category: parsed.data,
      original_confidence: existing.confidence,
    });
  }

  const { error } = await supabase
    .from("classifications")
    .update({ category: parsed.data })
    .eq("report_id", reportId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}

export async function addWorkOrderComment(
  workOrderId: string,
  body: string
): Promise<Result<{ id: string }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > 2000)
    return { ok: false, error: "invalid_body" };

  const supabase = createServerClient();

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
  afterTimestamp: string
): Promise<Result<WorkOrderWithDetails[]>> {
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
          reasoning
        )
      )
    `
    )
    .eq("reports.city_id", staff.city_id)
    .gt("created_at", afterTimestamp)
    .order("priority_score", { ascending: false });

  if (error) return { ok: false, error: error.message };

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

  return { ok: true, data: result };
}
