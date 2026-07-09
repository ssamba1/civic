import { CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import type {
  City,
  Classification,
  Report,
  ReportCategory,
  ReportStatus,
} from "@/lib/types";
import { getAgencyResponsible } from "./services";

export interface Open311Request {
  service_request_id: string;
  status: "open" | "closed";
  status_notes: string;
  service_name: string;
  service_code: string;
  description?: string;
  agency_responsible: string;
  service_notice: string;
  requested_datetime: string;
  updated_datetime: string;
  expected_datetime: string | null;
  address: string;
  lat: number;
  long: number;
  media_url: string;
  zipcode: string;
  extended_attributes?: {
    civic_category: string;
    civic_severity: number;
    civic_confidence: number;
    civic_reasoning?: string;
    civic_is_emergency?: boolean;
  };
}

/**
 * Map internal ReportStatus → Open311 binary status.
 * open/dispatched/in_progress → "open"; closed/merged/rejected → "closed"
 */
export function mapStatus(status: ReportStatus): "open" | "closed" {
  switch (status) {
    case "open":
    case "dispatched":
    case "in_progress":
      return "open";
    case "closed":
    case "merged":
    case "rejected":
      return "closed";
  }
}

/**
 * Invert Open311 status → list of internal statuses for DB filtering.
 */
export function expandStatus(open311Status: "open" | "closed"): ReportStatus[] {
  if (open311Status === "open") return ["open", "dispatched", "in_progress"];
  return ["closed", "merged", "rejected"];
}

// Coarsen coordinates to ~3 decimal places (~110 m) for the PUBLIC,
// unauthenticated Open311 feed: precise enough to place an issue on a block,
// coarse enough not to pinpoint a reporter's home. The app's own map reads the
// DB directly and is unaffected — only external Open311 consumers see this.
const COORD_PRECISION = 1000;
function coarsenCoord(n: number): number {
  return Math.round(n * COORD_PRECISION) / COORD_PRECISION;
}

/** Service name from category (title-cased, underscores removed) */
function serviceName(category: string): string {
  return category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Convert a Civic report + optional classification + city into Open311 format.
 * classification may be null if the report hasn't been classified yet.
 */
export function reportToOpen311(
  report: Report,
  classification: Classification | null,
  city: City,
): Open311Request {
  const category = (classification?.category ?? "other") as ReportCategory;

  // expected_datetime: for still-open requests, project the resolution deadline
  // from the category SLA window (created_at + N hours). Closed/merged/rejected
  // requests are already resolved, so their expectation is null. Uses the same
  // static CATEGORY_SLA_TARGETS the dashboard SLA metrics read — the public feed
  // reports the target, not a per-city override.
  const expectedDatetime =
    mapStatus(report.status) === "open"
      ? new Date(
          Date.parse(report.created_at) +
            CATEGORY_SLA_TARGETS[category] * 3_600_000,
        ).toISOString()
      : null;

  // D2: the public feed collapses to open/closed; the richer internal state
  // rides in status_notes so consumers can tell a fix from a merge/rejection.
  const statusNotes =
    report.status === "merged"
      ? "Duplicate of another report; tracked there."
      : report.status === "rejected"
        ? "Reviewed and closed without dispatch."
        : report.status === "closed"
          ? "Resolved."
          : "";

  const result: Open311Request = {
    service_request_id: report.id,
    status: mapStatus(report.status),
    status_notes: statusNotes,
    service_name: serviceName(category),
    service_code: category,
    agency_responsible: getAgencyResponsible(category, city.name),
    service_notice: "",
    requested_datetime: report.created_at,
    updated_datetime: report.updated_at,
    expected_datetime: expectedDatetime,
    address: report.address ?? "",
    lat: coarsenCoord(report.location.lat),
    long: coarsenCoord(report.location.lng),
    media_url: report.photo_public_url,
    zipcode: "",
  };

  if (classification) {
    result.extended_attributes = {
      civic_category: classification.category,
      civic_severity: classification.severity,
      civic_confidence: classification.confidence,
      civic_reasoning: classification.reasoning,
      civic_is_emergency: classification.is_emergency,
    };
  }

  return result;
}
