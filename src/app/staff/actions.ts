"use server";

import { createServerClient } from "@/lib/db/client";
import type { Result, ReportCategory } from "@/lib/types";

async function getStaffUser() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, city_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["staff_dispatcher", "staff_supervisor", "admin"].includes(profile.role)
  ) {
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
    await supabase
      .from("reports")
      .update({ status: "dispatched", updated_at: new Date().toISOString() })
      .eq("id", wo.report_id);
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
    await supabase
      .from("reports")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", wo.report_id);
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
  newCategory: string
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();

  const { error } = await supabase
    .from("classifications")
    .update({ category: newCategory })
    .eq("report_id", reportId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}
