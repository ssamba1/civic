"use server";

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { validateSchedule } from "@/lib/staff/schedule";
import type { Result } from "@/lib/types";

const logger = createLogger("[schedule-actions]");

// ---------------------------------------------------------------------------
// Auth guard, same pattern as src/app/staff/actions.ts getStaffUser()
// ---------------------------------------------------------------------------

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

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

// ---------------------------------------------------------------------------
// Graceful degrade helper
// Returns true when the scheduling columns exist. We probe by checking the
// information_schema rather than catching an error mid-mutation, so the query
// path stays clean on un-migrated DBs.
// ---------------------------------------------------------------------------

async function schedulingColumnsExist(
  db: ReturnType<typeof createServerClient>,
): Promise<boolean> {
  try {
    // PostgREST does not expose information_schema; use a known-safe SELECT
    // that will fail fast if the column is absent (LIMIT 0 = no rows fetched).
    const { error } = await db
      .from("work_orders")
      .select("scheduled_for")
      .limit(0);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// scheduleWorkOrder
// ---------------------------------------------------------------------------

/**
 * Set (or update) the scheduling window for a work order.
 *
 * @param workOrderId - UUID of the work order.
 * @param scheduledFor - ISO string (timestamptz) for when work starts.
 * @param windowEnd - Optional ISO string for when the window closes.
 * @param crewId - Optional UUID of the crew to assign.
 */
export async function scheduleWorkOrder(
  workOrderId: string,
  scheduledFor: string,
  windowEnd?: string,
  crewId?: string,
): Promise<Result<{ id: string }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "unauthorized" };

  const scheduledForDate = new Date(scheduledFor);
  if (Number.isNaN(scheduledForDate.getTime())) {
    return { ok: false, error: "invalid_date" };
  }

  const windowEndDate = windowEnd ? new Date(windowEnd) : undefined;
  if (windowEndDate && Number.isNaN(windowEndDate.getTime())) {
    return { ok: false, error: "invalid_window_end" };
  }

  const validation = validateSchedule({
    scheduledFor: scheduledForDate,
    windowEnd: windowEndDate,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const db = createServerClient();

  if (!(await schedulingColumnsExist(db))) {
    logger.warn("scheduling columns absent, migration 051 not applied", {
      workOrderId,
    });
    return { ok: false, error: "feature_not_migrated" };
  }

  // City-scope guard: the staff user may only modify work orders that belong to
  // their city. We verify via the reports join (same pattern as actions.ts).
  // Fail closed: a staffer with no city_id has no city scope, so no access
  // (matches the workOrderInStaffCity/reportInStaffCity convention in actions.ts).
  if (!staff.city_id) return { ok: false, error: "forbidden" };
  {
    const { data: wo } = await db
      .from("work_orders")
      .select("id, reports!inner(city_id)")
      .eq("id", workOrderId)
      .single();
    // biome-ignore lint/suspicious/noExplicitAny: PostgREST join shape cast
    const reportCityId = (wo?.reports as any)?.city_id ?? null;
    if (reportCityId !== staff.city_id) {
      return { ok: false, error: "forbidden" };
    }
  }

  const patch: Record<string, unknown> = {
    scheduled_for: scheduledFor,
    scheduled_window_end: windowEnd ?? null,
  };
  if (crewId !== undefined) {
    patch.assigned_crew_id = crewId || null;
  }

  const { error } = await db
    .from("work_orders")
    .update(patch)
    .eq("id", workOrderId);

  if (error) {
    logger.error("scheduleWorkOrder update failed", error, { workOrderId });
    return { ok: false, error: "db_error" };
  }

  return { ok: true, data: { id: workOrderId } };
}

// ---------------------------------------------------------------------------
// unscheduleWorkOrder
// ---------------------------------------------------------------------------

/** Clear the schedule for a work order (sets all scheduling fields to null). */
export async function unscheduleWorkOrder(
  workOrderId: string,
): Promise<Result<{ id: string }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "unauthorized" };

  const db = createServerClient();

  if (!(await schedulingColumnsExist(db))) {
    logger.warn("scheduling columns absent, migration 051 not applied", {
      workOrderId,
    });
    return { ok: false, error: "feature_not_migrated" };
  }

  // Fail closed: a staffer with no city_id has no city scope, so no access
  // (matches the workOrderInStaffCity/reportInStaffCity convention in actions.ts).
  if (!staff.city_id) return { ok: false, error: "forbidden" };
  {
    const { data: wo } = await db
      .from("work_orders")
      .select("id, reports!inner(city_id)")
      .eq("id", workOrderId)
      .single();
    // biome-ignore lint/suspicious/noExplicitAny: PostgREST join shape cast
    const reportCityId = (wo?.reports as any)?.city_id ?? null;
    if (reportCityId !== staff.city_id) {
      return { ok: false, error: "forbidden" };
    }
  }

  const { error } = await db
    .from("work_orders")
    .update({
      scheduled_for: null,
      scheduled_window_end: null,
      // intentionally do NOT null-out assigned_crew_id. Crew assignment is
      // independent from scheduling and may remain after unscheduling.
    })
    .eq("id", workOrderId);

  if (error) {
    logger.error("unscheduleWorkOrder update failed", error, { workOrderId });
    return { ok: false, error: "db_error" };
  }

  return { ok: true, data: { id: workOrderId } };
}

// ---------------------------------------------------------------------------
// getScheduledWorkOrders
// ---------------------------------------------------------------------------

export interface ScheduledWorkOrderRow {
  id: string;
  scheduledFor: string;
  scheduledWindowEnd: string | null;
  assignedCrewId: string | null;
  crewName: string | null;
  reportAddress: string | null;
  category: string | null;
  priorityScore: number | null;
  status: string;
}

/**
 * Fetch work orders with a `scheduled_for` in [fromDate, toDate] (ISO date
 * strings, inclusive) for a given city. Staff-gated. Degrades to [] when the
 * migration has not been applied.
 */
export async function getScheduledWorkOrders(
  cityId: string,
  fromDate: string,
  toDate: string,
): Promise<Result<ScheduledWorkOrderRow[]>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "unauthorized" };

  // City-scope guard.
  if (staff.city_id && staff.city_id !== cityId) {
    return { ok: false, error: "forbidden" };
  }

  const db = createServerClient();

  if (!(await schedulingColumnsExist(db))) {
    logger.warn("getScheduledWorkOrders: migration 051 not yet applied", {
      cityId,
    });
    return { ok: true, data: [] };
  }

  const { data, error } = await db
    .from("work_orders")
    .select(
      "id, scheduled_for, scheduled_window_end, assigned_crew_id, priority_score, crews(name), reports!inner(address, status, city_id, classifications(category))",
    )
    .eq("reports.city_id", cityId)
    .gte("scheduled_for", `${fromDate}T00:00:00.000Z`)
    .lte("scheduled_for", `${toDate}T23:59:59.999Z`)
    .order("scheduled_for");

  if (error) {
    logger.error("getScheduledWorkOrders query failed", error, { cityId });
    return { ok: false, error: "db_error" };
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    scheduled_for: string;
    scheduled_window_end: string | null;
    assigned_crew_id: string | null;
    priority_score: number | null;
    crews: { name: string } | null;
    reports: {
      address: string | null;
      status: string;
      city_id: string;
      classifications: { category: string } | { category: string }[] | null;
    } | null;
  }>;

  const out: ScheduledWorkOrderRow[] = rows
    .filter((r) => r.reports && r.scheduled_for)
    .map((r) => {
      const classifications = r.reports?.classifications;
      let category: string | null = null;
      if (classifications) {
        const c = Array.isArray(classifications)
          ? classifications[0]
          : classifications;
        category = c?.category ?? null;
      }
      return {
        id: r.id,
        scheduledFor: r.scheduled_for,
        scheduledWindowEnd: r.scheduled_window_end,
        assignedCrewId: r.assigned_crew_id,
        crewName: r.crews?.name ?? null,
        reportAddress: r.reports?.address ?? null,
        category,
        priorityScore: r.priority_score,
        status: r.reports?.status ?? "open",
      };
    });

  return { ok: true, data: out };
}
