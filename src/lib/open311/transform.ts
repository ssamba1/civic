import type {
  Report,
  Classification,
  City,
  ReportStatus,
  ReportCategory,
} from "@/lib/types";
import { getAgencyResponsible } from "./services";

export interface Open311Request {
  service_request_id: string;
  status: "open" | "closed";
  status_notes: string;
  service_name: string;
  service_code: string;
  description: string;
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
export function expandStatus(
  open311Status: "open" | "closed"
): ReportStatus[] {
  if (open311Status === "open") return ["open", "dispatched", "in_progress"];
  return ["closed", "merged", "rejected"];
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
  city: City
): Open311Request {
  const category = (classification?.category ?? "other") as ReportCategory;

  const result: Open311Request = {
    service_request_id: report.id,
    status: mapStatus(report.status),
    status_notes: "",
    service_name: serviceName(category),
    service_code: category,
    description: report.description ?? "",
    agency_responsible: getAgencyResponsible(category, city.name),
    service_notice: "",
    requested_datetime: report.created_at,
    updated_datetime: report.updated_at,
    expected_datetime: null,
    address: report.address ?? "",
    lat: report.location.lat,
    long: report.location.lng,
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
