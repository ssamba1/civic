import "server-only";

import { createHash } from "node:crypto";
import {
  CATEGORY_META,
  type DashboardReport,
  getReportCorpus,
} from "@/lib/dashboard-data";
import type { ReportCategory, ReportStatus } from "@/lib/types";

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

export interface PublicReportView {
  token: string;
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
  };
}

/**
 * Resolve a public token to a PII-safe report view, or null if no report maps
 * to it. O(n) over the corpus — fine for the demo set; a live deployment would
 * back this with an indexed token column. Never throws.
 */
export function getPublicReport(token: string): PublicReportView | null {
  if (!token) return null;
  const match = getReportCorpus().find((r) => publicToken(r.id) === token);
  return match ? toView(match) : null;
}
