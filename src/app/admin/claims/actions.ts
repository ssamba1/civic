"use server";

import "server-only";
import {
  CLAIM_STATES,
  type ClaimQueueRow,
  type ClaimState,
} from "@/components/liability/queue-types";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin-claims");

/* ==================================================================
   Read side of the /admin/claims review queue.

   Mutations live in `src/lib/liability/claims-actions.ts`:
   createDraftClaim / approveClaims / dismissClaim / resolveClaim. This
   file only assembles queue rows, so a claim state machine has exactly
   one owner.

   Every query degrades to an empty result rather than throwing. The
   claims migration (063) is written but NOT applied, so on a database
   that predates it the screen must render its empty state instead of
   500-ing. Same posture as the crews lookup in dashboard-grid-data.ts.
   ================================================================== */

export interface ClaimsAdminContext {
  adminId: string;
  cityId: string;
  citySlug: string | null;
}

/**
 * Admin gate. Mirrors requireAdmin in `src/app/admin/contractors/actions.ts`,
 * plus the city slug (currency formatting needs it). Null when not an admin.
 */
export async function requireClaimsAdmin(): Promise<ClaimsAdminContext | null> {
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";

  const db = createServerClient();

  if (devBypass) {
    const { data } = await db
      .from("cities")
      .select("id, slug")
      .limit(1)
      .maybeSingle<{ id: string; slug: string | null }>();
    return data ? { adminId: "", cityId: data.id, citySlug: data.slug } : null;
  }

  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await db
    .from("users")
    .select("role, city_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; city_id: string | null }>();

  if (error) {
    log.error("admin role check failed", error, { userId: user.id });
    return null;
  }
  if (data?.role !== "admin" || !data.city_id) return null;

  const { data: city } = await db
    .from("cities")
    .select("slug")
    .eq("id", data.city_id)
    .maybeSingle<{ slug: string | null }>();

  return {
    adminId: user.id,
    cityId: data.city_id,
    citySlug: city?.slug ?? null,
  };
}

/** Narrow an untrusted state string onto the known union. */
function asClaimState(value: unknown): ClaimState {
  return (CLAIM_STATES as readonly string[]).includes(value as string)
    ? (value as ClaimState)
    : "draft";
}

/** Read one field out of the immutable packet snapshot (spec 5.2). */
function packetField(packet: unknown, path: string[]): unknown {
  let node: unknown = packet;
  for (const key of path) {
    if (node == null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node ?? null;
}

function packetString(packet: unknown, path: string[]): string | null {
  const v = packetField(packet, path);
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Every claim in the acting admin city, newest first. The screen filters by
 * state client-side. A municipal queue is tens of rows, not thousands, and a
 * local filter keeps a multi-select intact while the operator flips tabs.
 */
export async function listClaims(): Promise<ClaimQueueRow[]> {
  const admin = await requireClaimsAdmin();
  if (!admin) return [];

  const db = createServerClient();
  const { data, error } = await db
    .from("claims")
    .select(
      "id, report_id, state, basis, liable_contractor_id, packet, estimated_value_cents, recovered_value_cents, sent_at, created_at",
    )
    .eq("city_id", admin.cityId)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("claims fetch failed", error, { cityId: admin.cityId });
    return [];
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  // Resolve contractor + report detail with separate lookups rather than a
  // PostgREST embed: an embed needs FKs from a migration that may not be
  // applied yet, and a missing FK would hard-fail the whole queue.
  const contractorIds = [
    ...new Set(
      rows
        .map((r) => r.liable_contractor_id as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const contractorById = new Map<
    string,
    { name: string; email: string | null }
  >();
  if (contractorIds.length > 0) {
    const { data: cData, error: cErr } = await db
      .from("contractors")
      .select("id, name, email")
      .in("id", contractorIds)
      // The claim rows are already city-scoped, but this secondary lookup ran
      // on ids alone through the service-role client. A contractor id that
      // appeared on a claim from another tenant would return that tenant's
      // contractor name and email.
      .eq("city_id", admin.cityId);
    if (cErr) {
      log.error("claim contractor lookup failed", cErr);
    } else {
      for (const c of (cData ?? []) as {
        id: string;
        name: string;
        email: string | null;
      }[]) {
        contractorById.set(c.id, { name: c.name, email: c.email });
      }
    }
  }

  const reportIds = [...new Set(rows.map((r) => r.report_id as string))];
  const addressById = new Map<string, string | null>();
  const { data: rData, error: rErr } = await db
    .from("reports")
    .select("id, address")
    .in("id", reportIds);
  if (rErr) {
    log.error("claim report lookup failed", rErr);
  } else {
    for (const r of (rData ?? []) as { id: string; address: string | null }[]) {
      addressById.set(r.id, r.address);
    }
  }

  return rows.map((row): ClaimQueueRow => {
    const contractor = row.liable_contractor_id
      ? (contractorById.get(row.liable_contractor_id as string) ?? null)
      : null;
    const packet = row.packet;
    const confidence = packetField(packet, ["liability", "confidence"]);
    return {
      id: row.id as string,
      report_id: row.report_id as string,
      state: asClaimState(row.state),
      basis:
        row.basis === "utility_restoration"
          ? "utility_restoration"
          : "warranty",
      liable_contractor_id: (row.liable_contractor_id as string) ?? null,
      contractor_name:
        contractor?.name ??
        packetString(packet, ["liability", "contractorName"]),
      contractor_email: contractor?.email ?? null,
      estimated_value_cents:
        row.estimated_value_cents != null
          ? Number(row.estimated_value_cents)
          : null,
      recovered_value_cents:
        row.recovered_value_cents != null
          ? Number(row.recovered_value_cents)
          : null,
      sent_at: (row.sent_at as string) ?? null,
      created_at: row.created_at as string,
      report_address:
        addressById.get(row.report_id as string) ??
        packetString(packet, ["defect", "address"]),
      report_category: packetString(packet, ["defect", "category"]),
      window_ends_on: packetString(packet, ["liability", "windowEndsOn"]),
      confidence: typeof confidence === "number" ? confidence : null,
      contract_ref: packetString(packet, ["liability", "contractRef"]),
      permit_ref: packetString(packet, ["liability", "permitRef"]),
    };
  });
}
