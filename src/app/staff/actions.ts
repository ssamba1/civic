"use server";

import { z } from "zod";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import type { Result, ReportCategory } from "@/lib/types";

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

  const { error } = await supabase
    .from("classifications")
    .update({ category: parsed.data })
    .eq("report_id", reportId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}
