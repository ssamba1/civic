import "server-only";

import { createHash } from "node:crypto";
import {
  CATEGORY_META,
  CATEGORY_SLA_TARGETS,
  type DashboardReport,
  getReportCorpus,
} from "@/lib/dashboard-data";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { HOUR_MS } from "@/lib/utils/time-constants";

/* ==================================================================
   Public, account-less report status — the tokenized status page that lets an
   anonymous reporter (no email, no login) check their report.

   Open311 GeoReport v2 has no push, and FixMyStreet's model is a stable public
   URL keyed by an UNGUESSABLE token (never a sequential id — that would leak
   every report's location to anyone iterating ids). We derive the token
   deterministically from the report id + a salt, so no DB column is needed and
   the same report always resolves to the same opaque URL.

   The view is PII-safe: category, public status, approximate address, the
   (already face/plate-blurred) public photo, and — when resolved — the
   resolution photo + date. No reporter id, no raw photo, no contact info.
   ================================================================== */

// Production should set PUBLIC_TOKEN_SALT to a secret so tokens can't be
// recomputed by a third party who knows the id scheme. The default keeps the
// demo deterministic across restarts.
const TOKEN_SALT = process.env.PUBLIC_TOKEN_SALT ?? "civic-public-status-v1";

/** Opaque, stable, unguessable token for a report id. */
export function publicToken(reportId: string): string {
  return createHash("sha256")
    .update(`${TOKEN_SALT}:${reportId}`)
    .digest("hex")
    .slice(0, 24);
}

export type PublicStatus = "in_progress" | "resolved" | "closed";

export interface PublicUpdate {
  statusLabel: string;
  note: string | null;
  at: string;
}

export interface PublicReportView {
  token: string;
  /** Internal report id — used server-side only (e.g. CSAT); never rendered. */
  reportId: string;
  category: ReportCategory;
  categoryLabel: string;
  categoryColor: string;
  publicStatus: PublicStatus;
  statusLabel: string;
  address: string;
  photoUrl: string;
  filedAt: string;
  resolvedAt?: string;
  resolutionPhotoUrl?: string;
  /**
   * Target fix-by date for a still-open report (OUTFLANK #4). Uses the work
   * order's stamped due_at when available (per-city SLA), else falls back to
   * filed date + the category's SLA window. Omitted once resolved.
   */
  estimatedFixBy?: string;
  /** Real status history (report_updates) — live reports only, PII-safe. */
  updates?: PublicUpdate[];
}

// Fix-by estimate for a resident: nothing once resolved; otherwise the stamped
// due_at (per-city SLA target) if present, else filed + category SLA window.
function computeFixBy(
  status: ReportStatus,
  category: ReportCategory,
  filedAt: string,
  dueAt?: string | null,
): string | undefined {
  if (status === "closed" || status === "merged" || status === "rejected") {
    return undefined;
  }
  if (dueAt) return dueAt;
  const targetHours = CATEGORY_SLA_TARGETS[category];
  if (!targetHours) return undefined;
  return new Date(Date.parse(filedAt) + targetHours * HOUR_MS).toISOString();
}

// Internal lifecycle → the two-value-plus public surface. open/dispatched/
// in_progress all read "In progress" publicly (Open311 collapses to "open");
// closed reads "Resolved"; merged/rejected read a neutral "Closed".
function toPublicStatus(status: ReportStatus): {
  publicStatus: PublicStatus;
  label: string;
} {
  switch (status) {
    case "closed":
      return { publicStatus: "resolved", label: "Resolved" };
    case "merged":
    case "rejected":
      return { publicStatus: "closed", label: "Closed" };
    default:
      return { publicStatus: "in_progress", label: "In progress" };
  }
}

function toView(report: DashboardReport): PublicReportView {
  const meta = CATEGORY_META[report.category];
  const { publicStatus, label } = toPublicStatus(report.status);
  return {
    token: publicToken(report.id),
    reportId: report.id,
    category: report.category,
    categoryLabel: meta.label,
    categoryColor: meta.color,
    publicStatus,
    statusLabel: label,
    address: report.address,
    photoUrl: report.photo_public_url,
    filedAt: report.created_at,
    resolvedAt: report.completed_at,
    resolutionPhotoUrl: report.afterPhoto,
    estimatedFixBy: computeFixBy(
      report.status,
      report.category,
      report.created_at,
    ),
  };
}

/**
 * Resolve a public token to a PII-safe report view, or null if no report maps
 * to it. O(n) over the corpus — fine for the demo set; live reports resolve
 * via {@link resolvePublicReport} instead. Never throws.
 */
export function getPublicReport(token: string): PublicReportView | null {
  if (!token) return null;
  const match = getReportCorpus().find((r) => publicToken(r.id) === token);
  return match ? toView(match) : null;
}

interface LiveTokenRow {
  id: string;
  status: ReportStatus;
  address: string | null;
  photo_public_url: string | null;
  created_at: string;
  classifications:
    | { category: ReportCategory | null }[]
    | { category: ReportCategory | null }
    | null;
  work_orders:
    | {
        completed_at: string | null;
        resolution_photo_url: string | null;
        due_at: string | null;
      }[]
    | {
        completed_at: string | null;
        resolution_photo_url: string | null;
        due_at: string | null;
      }
    | null;
  report_updates:
    | { status: ReportStatus; note: string | null; created_at: string }[]
    | null;
}

// Public projection of an internal status — mirrors toPublicStatus's collapse
// so history entries never reveal more than the page's own status chip.
function publicUpdateLabel(status: ReportStatus): string {
  return toPublicStatus(status).label;
}

/**
 * Token resolution for BOTH deployments: the in-memory demo corpus first (it
 * covers every synthetic report), then the live DB via the indexed
 * reports.public_token column (stamped by status-notify the first time a link
 * leaves the system). Service-role read — the page itself is the public
 * surface and the view is PII-safe by construction. Never throws.
 */
export async function resolvePublicReport(
  token: string,
): Promise<PublicReportView | null> {
  const demo = getPublicReport(token);
  if (demo) return demo;
  if (!token || !/^[0-9a-f]{24}$/.test(token)) return null;

  try {
    // Dynamic import keeps the demo path free of a hard client dependency.
    const { createServerClient } = await import("@/lib/db/client");
    const db = createServerClient();
    const { data, error } = await db
      .from("reports")
      .select(
        "id, status, address, photo_public_url, created_at, classifications ( category ), work_orders ( completed_at, resolution_photo_url, due_at ), report_updates ( status, note, created_at )",
      )
      .eq("public_token", token)
      .maybeSingle<LiveTokenRow>();
    if (error || !data) return null;

    const cl = Array.isArray(data.classifications)
      ? (data.classifications[0] ?? null)
      : data.classifications;
    const category = (cl?.category ?? "other") as ReportCategory;
    const wo = Array.isArray(data.work_orders)
      ? (data.work_orders[0] ?? null)
      : data.work_orders;
    const meta = CATEGORY_META[category];
    const { publicStatus, label } = toPublicStatus(data.status);

    return {
      token,
      reportId: data.id,
      category,
      categoryLabel: meta.label,
      categoryColor: meta.color,
      publicStatus,
      statusLabel: label,
      address: data.address ?? "Location on file",
      photoUrl: data.photo_public_url ?? "",
      filedAt: data.created_at,
      resolvedAt: wo?.completed_at ?? undefined,
      resolutionPhotoUrl: wo?.resolution_photo_url ?? undefined,
      estimatedFixBy: computeFixBy(
        data.status,
        category,
        data.created_at,
        wo?.due_at,
      ),
      updates: (data.report_updates ?? [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((u) => ({
          statusLabel: publicUpdateLabel(u.status),
          note: u.note,
          at: u.created_at,
        })),
    };
  } catch {
    return null;
  }
}
