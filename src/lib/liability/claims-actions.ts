"use server";

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import {
  type ClaimState,
  requireTransition,
} from "@/lib/liability/claim-state";
import {
  assemblePacket,
  type ClaimableVerdict,
  type PacketInput,
  type PacketObservation,
} from "@/lib/liability/packet";
import type { ClaimPacket } from "@/lib/liability/types";
import { createLogger } from "@/lib/logger";
import { deliverEmail } from "@/lib/notify/deliver";
import { isTerminal } from "@/lib/notify/outbox";
import { normalizeLocation, type Result } from "@/lib/types";

/* ==================================================================
   Claim server actions (spec §5.2).

   Staff-gated, city-scoped, Result-returning. Three invariants:

   1. `claims.packet` is written ONCE at draft time and never rewritten —
      the claim as sent must stay reproducible when source rows are later
      corrected (spec §5.2).
   2. Every state change goes through requireTransition() in claim-state.ts;
      the state machine lives there because a "use server" module may only
      export async functions.
   3. approveClaims delivers ONE email per contractor for the whole batch
      (spec §5.3 — per-claim letters cost more staff time than the claims
      recover). Delivery outcome is read with the outbox's isTerminal()
      policy: a transient send-error leaves the claim un-sent for retry
      rather than marking it delivered.

   The claims table (spec §5.2) has no free-text reason column, so dismissal
   reasons and recovery amounts are journalled to `audit_log` (migration 001)
   rather than inventing schema another worker owns.
   ================================================================== */

const logger = createLogger("[claims-actions]");

const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;

type StaffProfile = { id: string; role: string; city_id: string | null };

async function getStaffUser(): Promise<StaffProfile | null> {
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
        .maybeSingle<StaffProfile>();
      return devStaff && STAFF_ROLES.includes(devStaff.role as never)
        ? devStaff
        : null;
    }
    return null;
  }

  const { data: profile } = await db
    .from("users")
    .select("id, role, city_id")
    .eq("id", user.id)
    .maybeSingle<StaffProfile>();

  if (!profile || !STAFF_ROLES.includes(profile.role as never)) return null;
  return profile;
}

async function journal(
  db: ReturnType<typeof createServerClient>,
  userId: string,
  action: string,
  recordId: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Bookkeeping must never fail the action the staffer actually asked for.
  const { error } = await db.from("audit_log").insert({
    user_id: userId,
    action,
    table_name: "claims",
    record_id: recordId,
    new_data: data,
  });
  if (error) {
    logger.warn("audit_journal_failed", {
      action,
      recordId,
      error: error.message,
    });
  }
}

/** First numeric field present on a row, for schema-tolerant cluster reads. */
function firstNumber(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function firstString(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * Camera reports carry their cluster id in reports.source_external_id. The
 * cluster table is owned by the camera worker and may not be migrated yet, so
 * this reads defensively: any failure degrades to "one observation", which is
 * the resident-report default and never overstates the evidence.
 */
async function loadObservation(
  db: ReturnType<typeof createServerClient>,
  source: string | null,
  sourceExternalId: string | null,
): Promise<PacketObservation | null> {
  if (source !== "camera" || !sourceExternalId) return null;
  const { data, error } = await db
    .from("detection_clusters")
    .select("*")
    .eq("id", sourceExternalId)
    .maybeSingle<Record<string, unknown>>();
  if (error || !data) return null;
  const count = firstNumber(data, [
    "detection_count",
    "pass_count",
    "observation_count",
  ]);
  if (count === null) return null;
  return {
    count,
    distinctDays: firstNumber(data, ["distinct_days", "day_count"]) ?? 1,
    firstSeenAt: firstString(data, ["first_seen_at", "created_at"]),
    lastSeenAt: firstString(data, ["last_seen_at", "updated_at"]),
  };
}

/**
 * Assemble the packet for a report with a non-city_cost liability verdict and
 * store it as a `draft` claim. Idempotent-ish: refuses when a live (non
 * dismissed) claim already exists for the report.
 */
export async function createDraftClaim(
  reportId: string,
): Promise<Result<{ claimId: string }>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id)
    return { ok: false, error: "Unauthorized: no city scope" };

  const db = createServerClient();

  const { data: report, error: reportErr } = await db
    .from("reports")
    .select(
      "id, city_id, address, location, created_at, source, source_external_id, hazard_severity",
    )
    .eq("id", reportId)
    .maybeSingle<{
      id: string;
      city_id: string;
      address: string | null;
      location: unknown;
      created_at: string;
      source: string | null;
      source_external_id: string | null;
      hazard_severity: string | null;
    }>();
  if (reportErr) return { ok: false, error: reportErr.message };
  if (!report) return { ok: false, error: "Report not found" };
  if (report.city_id !== staff.city_id)
    return { ok: false, error: "Unauthorized: report not in your city" };

  const point = normalizeLocation(report.location);
  if (!point) return { ok: false, error: "Report has no usable location" };

  const { data: liability } = await db
    .from("report_liability")
    .select(
      "verdict, capital_job_id, warranty_id, utility_permit_id, liable_contractor_id, window_ends_on, match_distance_m, confidence",
    )
    .eq("report_id", reportId)
    .maybeSingle<{
      verdict: string;
      capital_job_id: string | null;
      warranty_id: string | null;
      utility_permit_id: string | null;
      liable_contractor_id: string | null;
      window_ends_on: string | null;
      match_distance_m: number | null;
      confidence: number;
    }>();
  if (!liability)
    return { ok: false, error: "No liability evaluation for this report" };
  if (
    liability.verdict !== "contractor_warranty" &&
    liability.verdict !== "utility_restoration"
  ) {
    return {
      ok: false,
      error: `Report verdict is '${liability.verdict}' — no claim to make`,
    };
  }

  const { data: existing } = await db
    .from("claims")
    .select("id, state")
    .eq("report_id", reportId)
    .neq("state", "dismissed")
    .limit(1)
    .maybeSingle<{ id: string; state: string }>();
  if (existing)
    return {
      ok: false,
      error: `Claim ${existing.id} already exists for this report (${existing.state})`,
    };

  const [classification, photos, job, warranty, permit, contractor, workOrder] =
    await Promise.all([
      db
        .from("classifications")
        .select("category, severity")
        .eq("report_id", reportId)
        .maybeSingle<{ category: string; severity: number | null }>(),
      db
        .from("report_photos")
        .select("public_url, idx")
        .eq("report_id", reportId)
        .order("idx", { ascending: true }),
      liability.capital_job_id
        ? db
            .from("capital_jobs")
            .select("contract_ref, completed_at")
            .eq("id", liability.capital_job_id)
            .maybeSingle<{
              contract_ref: string | null;
              completed_at: string | null;
            }>()
        : Promise.resolve({ data: null }),
      liability.warranty_id
        ? db
            .from("warranties")
            .select("warranty_type")
            .eq("id", liability.warranty_id)
            .maybeSingle<{ warranty_type: string | null }>()
        : Promise.resolve({ data: null }),
      liability.utility_permit_id
        ? db
            .from("utility_permits")
            .select("permit_ref, permittee_name")
            .eq("id", liability.utility_permit_id)
            .maybeSingle<{
              permit_ref: string | null;
              permittee_name: string | null;
            }>()
        : Promise.resolve({ data: null }),
      liability.liable_contractor_id
        ? db
            .from("contractors")
            .select("name")
            .eq("id", liability.liable_contractor_id)
            .maybeSingle<{ name: string | null }>()
        : Promise.resolve({ data: null }),
      db
        .from("work_orders")
        .select("est_cost")
        .eq("report_id", reportId)
        .maybeSingle<{ est_cost: number | null }>(),
    ]);

  const observation = await loadObservation(
    db,
    report.source,
    report.source_external_id,
  );

  const photoUrls = (photos.data ?? [])
    .map((p: { public_url: string }) => p.public_url)
    .filter(Boolean);

  const input: PacketInput = {
    report: {
      id: report.id,
      category: classification.data?.category ?? "other",
      severity: classification.data?.severity ?? null,
      hazardSeverity: report.hazard_severity,
      address: report.address,
      lng: point.lng,
      lat: point.lat,
      observedAt: report.created_at,
      source: report.source,
    },
    photoUrls,
    liability: {
      verdict: liability.verdict as ClaimableVerdict,
      contractorId: liability.liable_contractor_id,
      contractRef: job.data?.contract_ref ?? null,
      permitRef: permit.data?.permit_ref ?? null,
      jobCompletedAt: job.data?.completed_at ?? null,
      warrantyType: warranty.data?.warranty_type ?? null,
      windowEndsOn: liability.window_ends_on,
      matchDistanceM: liability.match_distance_m,
      confidence: liability.confidence,
    },
    contractorName:
      contractor.data?.name ?? permit.data?.permittee_name ?? null,
    observation,
  };

  const packet = assemblePacket(input);
  const estCost = workOrder.data?.est_cost;

  const { data: inserted, error: insertErr } = await db
    .from("claims")
    .insert({
      city_id: report.city_id,
      report_id: report.id,
      liable_contractor_id: liability.liable_contractor_id,
      basis: packet.basis,
      state: "draft" satisfies ClaimState,
      packet,
      estimated_value_cents:
        typeof estCost === "number" ? Math.round(estCost * 100) : null,
      created_by: staff.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !inserted)
    return { ok: false, error: insertErr?.message ?? "Claim insert failed" };

  return { ok: true, data: { claimId: inserted.id } };
}

interface ApproveSummary {
  /** Claim ids moved to 'sent'. */
  sent: string[];
  /** Claim ids left untouched, with why. */
  skipped: Array<{ claimId: string; reason: string }>;
  /** One entry per contractor the batch mailed. */
  deliveries: Array<{
    contractorId: string;
    claimCount: number;
    delivered: boolean;
  }>;
}

function claimLine(packet: ClaimPacket | null, claimId: string): string {
  if (!packet) return `• Claim ${claimId}`;
  const where =
    packet.defect.address ?? `${packet.defect.lat}, ${packet.defect.lng}`;
  const ref =
    packet.liability.contractRef ?? packet.liability.permitRef ?? "no ref";
  return `• ${packet.defect.category} at ${where} — ${ref} — claim ${claimId}`;
}

/**
 * Approve a batch of draft claims: mark them sent, assign the work orders to
 * the liable contractor, and mail ONE letter per contractor covering all their
 * claims. Per-contractor atomicity — a delivery that fails transiently leaves
 * that contractor's claims in their prior state so the queue can retry.
 */
export async function approveClaims(
  claimIds: string[],
): Promise<Result<ApproveSummary>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id)
    return { ok: false, error: "Unauthorized: no city scope" };
  if (claimIds.length === 0) return { ok: false, error: "No claims selected" };

  const db = createServerClient();
  const summary: ApproveSummary = { sent: [], skipped: [], deliveries: [] };

  const { data: claims, error } = await db
    .from("claims")
    .select("id, state, report_id, liable_contractor_id, packet")
    .in("id", claimIds)
    .eq("city_id", staff.city_id);
  if (error) return { ok: false, error: error.message };

  const rows = (claims ?? []) as Array<{
    id: string;
    state: ClaimState;
    report_id: string;
    liable_contractor_id: string | null;
    packet: ClaimPacket | null;
  }>;

  const found = new Set(rows.map((r) => r.id));
  for (const id of claimIds) {
    if (!found.has(id))
      summary.skipped.push({
        claimId: id,
        reason: "Not found in your city",
      });
  }

  // Group the sendable claims by contractor — one letter each (spec §5.3).
  const byContractor = new Map<string, typeof rows>();
  for (const row of rows) {
    const transition = requireTransition(row.state, "sent");
    if (!transition.ok) {
      summary.skipped.push({ claimId: row.id, reason: transition.error });
      continue;
    }
    if (!row.liable_contractor_id) {
      summary.skipped.push({
        claimId: row.id,
        reason: "Claim has no liable contractor",
      });
      continue;
    }
    const group = byContractor.get(row.liable_contractor_id) ?? [];
    group.push(row);
    byContractor.set(row.liable_contractor_id, group);
  }

  for (const [contractorId, group] of byContractor) {
    const { data: contractor } = await db
      .from("contractors")
      .select("name, email")
      .eq("id", contractorId)
      .maybeSingle<{ name: string | null; email: string | null }>();

    const lines = group.map((row) => claimLine(row.packet, row.id));
    const delivery = await deliverEmail({
      to: contractor?.email ?? null,
      subject: `Warranty claim${group.length === 1 ? "" : "s"} — ${group.length} defect${group.length === 1 ? "" : "s"}`,
      heading: `${group.length} defect${group.length === 1 ? "" : "s"} within your liability window`,
      body: [
        `${contractor?.name ?? "Contractor"} — the City has attributed the following defect${group.length === 1 ? "" : "s"} to work still covered by your contract or permit obligations.`,
        lines.join("\n"),
        group[0]?.packet?.requestedAction ?? "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    // Outbox policy: only a transient send-error is worth retrying. Anything
    // terminal (delivered, or intentionally disabled/keyless in demo builds)
    // commits the state change.
    if (!isTerminal(delivery)) {
      for (const row of group) {
        summary.skipped.push({
          claimId: row.id,
          reason: `Delivery failed (${delivery.reason ?? "send-error"}) — not sent, retry`,
        });
      }
      summary.deliveries.push({
        contractorId,
        claimCount: group.length,
        delivered: false,
      });
      logger.warn("claim_batch_delivery_failed", {
        contractorId,
        claimCount: group.length,
        reason: delivery.reason,
      });
      continue;
    }

    const sentAt = new Date().toISOString();
    const ids = group.map((row) => row.id);
    const { error: updateErr } = await db
      .from("claims")
      .update({ state: "sent", sent_at: sentAt })
      .in("id", ids);
    if (updateErr) {
      for (const row of group) {
        summary.skipped.push({ claimId: row.id, reason: updateErr.message });
      }
      continue;
    }

    // Assign the work orders so the contractor portal (053 lifecycle) shows
    // the job. Best-effort per report: a missing work order must not undo a
    // claim that has already left the building.
    for (const row of group) {
      const { error: woErr } = await db
        .from("work_orders")
        .update({
          contractor_id: contractorId,
          contractor_status: "assigned",
        })
        .eq("report_id", row.report_id);
      if (woErr) {
        logger.warn("claim_work_order_assign_failed", {
          claimId: row.id,
          reportId: row.report_id,
          error: woErr.message,
        });
      }
      await journal(db, staff.id, "claim_sent", row.id, {
        contractor_id: contractorId,
        delivered: delivery.sent,
        delivery_reason: delivery.reason ?? null,
        sent_at: sentAt,
      });
    }

    summary.sent.push(...ids);
    summary.deliveries.push({
      contractorId,
      claimCount: group.length,
      delivered: delivery.sent,
    });
  }

  return { ok: true, data: summary };
}

/** Staff decided the city absorbs this one. Reason is journalled to audit_log. */
export async function dismissClaim(
  claimId: string,
  reason: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id)
    return { ok: false, error: "Unauthorized: no city scope" };
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A dismissal reason is required" };

  const db = createServerClient();
  const { data: claim } = await db
    .from("claims")
    .select("id, state")
    .eq("id", claimId)
    .eq("city_id", staff.city_id)
    .maybeSingle<{ id: string; state: ClaimState }>();
  if (!claim) return { ok: false, error: "Claim not found in your city" };

  const transition = requireTransition(claim.state, "dismissed");
  if (!transition.ok) return { ok: false, error: transition.error };

  const { error } = await db
    .from("claims")
    .update({ state: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", claimId);
  if (error) return { ok: false, error: error.message };

  await journal(db, staff.id, "claim_dismissed", claimId, {
    from_state: claim.state,
    reason: trimmed,
  });
  return { ok: true, data: undefined };
}

/** Close the loop with the recovered amount — the recovery ledger's input. */
export async function resolveClaim(
  claimId: string,
  recoveredCents: number,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };
  if (!staff.city_id)
    return { ok: false, error: "Unauthorized: no city scope" };
  if (!Number.isFinite(recoveredCents) || recoveredCents < 0)
    return { ok: false, error: "Recovered amount must be zero or positive" };

  const db = createServerClient();
  const { data: claim } = await db
    .from("claims")
    .select("id, state")
    .eq("id", claimId)
    .eq("city_id", staff.city_id)
    .maybeSingle<{ id: string; state: ClaimState }>();
  if (!claim) return { ok: false, error: "Claim not found in your city" };

  const transition = requireTransition(claim.state, "resolved");
  if (!transition.ok) return { ok: false, error: transition.error };

  const resolvedAt = new Date().toISOString();
  const { error } = await db
    .from("claims")
    .update({
      state: "resolved",
      recovered_value_cents: Math.round(recoveredCents),
      resolved_at: resolvedAt,
    })
    .eq("id", claimId);
  if (error) return { ok: false, error: error.message };

  await journal(db, staff.id, "claim_resolved", claimId, {
    from_state: claim.state,
    recovered_value_cents: Math.round(recoveredCents),
    resolved_at: resolvedAt,
  });
  return { ok: true, data: undefined };
}
