"use server";

import "server-only";
import {
  type ContractorStatus,
  canTransition,
  validateProgressUpdate,
} from "@/lib/contractor/status";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const log = createLogger("contractor-actions");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractorWorkOrder {
  id: string;
  reportId: string;
  department: string;
  priority_score: number;
  est_minutes: number | null;
  dispatched_at: string | null;
  contractor_status: ContractorStatus | null;
  contractor_note: string | null;
  contractor_photo_url: string | null;
  contractor_updated_at: string | null;
  /** Denormalised from the joined report row. */
  report_address: string | null;
  report_category: string | null;
  report_description: string | null;
  report_photo_url: string | null;
}

// ---------------------------------------------------------------------------
// Internal helper: resolve current contractor id from auth email
// ---------------------------------------------------------------------------

async function resolveContractorId(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;

  const db = createServerClient();
  const { data, error } = await db
    .from("contractors")
    .select("id")
    .eq("active", true)
    // Exact match on normalized email (DB has UNIQUE + LOWER(email) index)
    .eq("email", user.email.toLowerCase())
    .maybeSingle<{ id: string }>();

  if (error) {
    log.error("resolveContractorId failed", error, { email: user.email });
    return null;
  }
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// listMyWorkOrders
//
// Returns ONLY the work orders assigned to the current contractor. If the
// caller is not an authenticated contractor, returns an empty array (graceful
// degrade. Never throws).
// ---------------------------------------------------------------------------

export async function listMyWorkOrders(): Promise<ContractorWorkOrder[]> {
  try {
    const contractorId = await resolveContractorId();
    if (!contractorId) return [];

    const db = createServerClient();

    // Use service-role client so the join to reports works without the
    // contractor having SELECT on reports. The contractor_id filter is the
    // authorisation boundary. They can only see their own rows.
    const { data, error } = await db
      .from("work_orders")
      // reports holds address/description/photo_public_url; category lives in
      // the classifications table (joined via report_id), not on reports.
      .select(
        `id, report_id, department, priority_score, est_minutes,
         dispatched_at, contractor_status, contractor_note,
         contractor_photo_url, contractor_updated_at,
         reports!inner (address, description, photo_public_url),
         classifications (category)`,
      )
      .eq("contractor_id", contractorId)
      .order("priority_score", { ascending: false });

    if (error) {
      log.error("listMyWorkOrders query failed", error, { contractorId });
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const report = (row.reports ?? {}) as Record<string, unknown>;
      // classifications embeds as an object (to-one) or array depending on the
      // inferred relationship, normalise both.
      const classification = Array.isArray(row.classifications)
        ? ((row.classifications[0] ?? {}) as Record<string, unknown>)
        : ((row.classifications ?? {}) as Record<string, unknown>);
      return {
        id: row.id as string,
        reportId: row.report_id as string,
        department: row.department as string,
        priority_score: row.priority_score as number,
        est_minutes: (row.est_minutes as number | null) ?? null,
        dispatched_at: (row.dispatched_at as string | null) ?? null,
        contractor_status:
          (row.contractor_status as ContractorStatus | null) ?? null,
        contractor_note: (row.contractor_note as string | null) ?? null,
        contractor_photo_url:
          (row.contractor_photo_url as string | null) ?? null,
        contractor_updated_at:
          (row.contractor_updated_at as string | null) ?? null,
        report_address: (report.address as string | null) ?? null,
        report_category: (classification.category as string | null) ?? null,
        report_description: (report.description as string | null) ?? null,
        report_photo_url: (report.photo_public_url as string | null) ?? null,
      };
    });
  } catch (err) {
    log.error("listMyWorkOrders threw", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// updateWorkOrderProgress
//
// Defense-in-depth: verifies ownership BEFORE writing, even though the RLS
// policy also enforces it. This prevents any edge-case where a service-role
// call (which bypasses RLS) could be misused. We re-check at the action layer.
//
// Column whitelist: only contractor_status, contractor_note,
// contractor_photo_url, contractor_updated_at are ever written. No other
// columns are touched.
// ---------------------------------------------------------------------------

export async function updateWorkOrderProgress(
  workOrderId: string,
  status: ContractorStatus,
  note?: string,
  photoUrl?: string,
): Promise<Result<void>> {
  try {
    // 1. Input validation (pure, no DB)
    const validation = validateProgressUpdate({
      workOrderId,
      status,
      note,
      photoUrl,
    });
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    // 2. Resolve contractor
    const contractorId = await resolveContractorId();
    if (!contractorId) {
      return { ok: false, error: "unauthorized" };
    }

    const db = createServerClient();

    // 3. Fetch current row, verify ownership and current status
    const { data: existing, error: fetchErr } = await db
      .from("work_orders")
      .select("id, contractor_id, contractor_status")
      .eq("id", workOrderId)
      .maybeSingle<{
        id: string;
        contractor_id: string | null;
        contractor_status: ContractorStatus | null;
      }>();

    if (fetchErr) {
      log.error("updateWorkOrderProgress fetch failed", fetchErr, {
        workOrderId,
        contractorId,
      });
      return { ok: false, error: "db_error" };
    }

    if (!existing) {
      return { ok: false, error: "not_found" };
    }

    // Defense-in-depth: verify the work order belongs to this contractor.
    if (existing.contractor_id !== contractorId) {
      log.warn("contractor ownership check failed, possible tampering", {
        workOrderId,
        contractorId,
        actualContractorId: existing.contractor_id,
      });
      return { ok: false, error: "unauthorized" };
    }

    // 4. State machine check
    const currentStatus: ContractorStatus =
      existing.contractor_status ?? "assigned";
    if (!canTransition(currentStatus, status)) {
      return {
        ok: false,
        error: `invalid_transition:${currentStatus}→${status}`,
      };
    }

    // 5. Write, ONLY whitelisted columns
    const { error: updateErr } = await db
      .from("work_orders")
      .update({
        contractor_status: status,
        contractor_note: note ?? null,
        contractor_photo_url: photoUrl || null,
        contractor_updated_at: new Date().toISOString(),
      })
      .eq("id", workOrderId)
      // Extra safety: re-assert contractor_id in the WHERE clause so the UPDATE
      // is a no-op if the row was re-assigned between our SELECT and UPDATE.
      .eq("contractor_id", contractorId);

    if (updateErr) {
      log.error("updateWorkOrderProgress update failed", updateErr, {
        workOrderId,
        contractorId,
      });
      return { ok: false, error: "db_error" };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    log.error("updateWorkOrderProgress threw", err, { workOrderId });
    return { ok: false, error: "unexpected_error" };
  }
}
