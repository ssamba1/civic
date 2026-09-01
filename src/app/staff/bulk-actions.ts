"use server";

/**
 * Bulk staff operations, server actions.
 *
 * Security model
 * - FAIL CLOSED: if getStaffUser() returns null for any reason (unauthenticated,
 *   wrong role, missing city_id) we return an error and touch nothing.
 * - city_id is validated to be non-null before any mutation. A staffer with a
 *   null city_id cannot act on any report.
 * - Per-report city membership is verified in a SINGLE batch query (.in()), not
 *   per-row, to avoid N+1. Reports outside the staffer's city are silently
 *   skipped and counted in `skipped`.
 * - Raw DB errors are never forwarded to the caller; only generic error codes
 *   are returned. Full detail is logged server-side only.
 */

import { z } from "zod";

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import type { BulkAction } from "@/lib/staff/bulk";
import { validateBulkAction, validateBulkSelection } from "@/lib/staff/bulk";
import type { Result } from "@/lib/types";

const logger = createLogger("[bulk-actions]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

// ---------------------------------------------------------------------------
// Internal auth helper (mirrors the pattern in actions.ts, cannot import it
// directly as it's not exported. Keep in sync if that changes).
// ---------------------------------------------------------------------------

type StaffUser = { id: string; role: string; city_id: string | null };

async function getStaffUser(): Promise<StaffUser | null> {
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
      return devStaff &&
        STAFF_ROLES.includes(devStaff.role as (typeof STAFF_ROLES)[number])
        ? devStaff
        : null;
    }
    return null;
  }

  const { data: profile } = await db
    .from("users")
    .select("id, role, city_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !STAFF_ROLES.includes(profile.role as (typeof STAFF_ROLES)[number])
  ) {
    return null;
  }
  return profile;
}

// ---------------------------------------------------------------------------
// UUID schema for zod
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Public action
// ---------------------------------------------------------------------------

export interface BulkUpdateResult {
  updated: number;
  skipped: number;
}

/**
 * Apply a bulk action to a set of reports.
 *
 * Reports that do not belong to the staffer's city are silently skipped (not
 * an error). If the staffer has no city_id the call fails immediately.
 */
export async function bulkUpdateReports(
  reportIds: string[],
  action: string,
  value: string | null,
): Promise<Result<BulkUpdateResult>> {
  // --- Auth ---
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "unauthorized" };

  // FAIL CLOSED: null city_id means no city scope. Cannot act on any reports.
  if (!staff.city_id) {
    logger.error("Staff user has null city_id, bulk action denied", null, {
      staffId: staff.id,
    });
    return { ok: false, error: "no_city_scope" };
  }

  // --- Validate selection ---
  const selResult = validateBulkSelection(reportIds);
  if (!selResult.ok) return { ok: false, error: selResult.error };
  const cleanIds = selResult.data;

  // --- Validate action+value ---
  const actionResult = validateBulkAction(action, value);
  if (!actionResult.ok) return { ok: false, error: actionResult.error };
  const { action: bulkAction, value: cleanValue } = actionResult.data;

  // Additional UUID validation via zod (belt-and-suspenders)
  for (const id of cleanIds) {
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) {
      return { ok: false, error: `invalid_uuid:${id}` };
    }
  }

  const db = createServerClient();
  const cityId = staff.city_id;

  // --- Batch fetch: get only reports that belong to this city (one DB round-trip) ---
  let eligibleIds: string[];
  try {
    const { data, error } = await db
      .from("reports")
      .select("id")
      .in("id", cleanIds)
      .eq("city_id", cityId);

    if (error) {
      logger.error("Bulk: fetch eligible reports failed", error, {
        staffId: staff.id,
        cityId,
      });
      return { ok: false, error: "fetch_failed" };
    }

    eligibleIds = (data ?? []).map((r: { id: string }) => r.id);
  } catch (err) {
    logger.error("Bulk: unexpected error fetching reports", err, {
      staffId: staff.id,
    });
    return { ok: false, error: "fetch_failed" };
  }

  const skipped = cleanIds.length - eligibleIds.length;

  if (eligibleIds.length === 0) {
    // All reports were out-of-city scope; nothing to do.
    return { ok: true, data: { updated: 0, skipped } };
  }

  // --- Apply the mutation (one DB round-trip) ---
  try {
    const result = await applyBulkMutation(
      db,
      eligibleIds,
      bulkAction,
      cleanValue,
      staff.id,
    );
    if (!result.ok) return result;
    return { ok: true, data: { updated: result.data, skipped } };
  } catch (err) {
    logger.error("Bulk: mutation failed unexpectedly", err, {
      action: bulkAction,
      staffId: staff.id,
    });
    return { ok: false, error: "mutation_failed" };
  }
}

// ---------------------------------------------------------------------------
// Internal mutation dispatcher
// ---------------------------------------------------------------------------

async function applyBulkMutation(
  db: ReturnType<typeof createServerClient>,
  ids: string[],
  action: BulkAction,
  value: string | null,
  staffId: string,
): Promise<Result<number>> {
  const now = new Date().toISOString();

  switch (action) {
    case "acknowledge": {
      const { error } = await db
        .from("reports")
        .update({ acknowledged_at: now, updated_at: now })
        .in("id", ids)
        .select("id");
      if (error) {
        logger.error("Bulk acknowledge failed", error, { staffId });
        return { ok: false, error: "acknowledge_failed" };
      }
      return { ok: true, data: ids.length };
    }

    case "set_status": {
      const { error } = await db
        .from("reports")
        .update({ status: value, updated_at: now })
        .in("id", ids);
      if (error) {
        logger.error("Bulk set_status failed", error, { staffId, value });
        return { ok: false, error: "set_status_failed" };
      }
      return { ok: true, data: ids.length };
    }

    case "set_priority": {
      const { error } = await db
        .from("reports")
        .update({ priority: value, updated_at: now })
        .in("id", ids);
      if (error) {
        logger.error("Bulk set_priority failed", error, { staffId, value });
        return { ok: false, error: "set_priority_failed" };
      }
      return { ok: true, data: ids.length };
    }

    case "assign_team": {
      // Assign team on work_orders linked to these reports. Work orders may
      // not exist for every report (not yet classified); we only update those
      // that do exist.
      const { error } = await db
        .from("work_orders")
        .update({ team_key: value, updated_at: now })
        .in("report_id", ids);
      if (error) {
        logger.error("Bulk assign_team failed", error, { staffId, value });
        return { ok: false, error: "assign_team_failed" };
      }
      return { ok: true, data: ids.length };
    }
  }
}
