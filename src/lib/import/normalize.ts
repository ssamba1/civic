// Legacy data migration normalizer (NEXT_100 #81)
// Maps a raw record from CSV or SeeClickFix JSON to NormalizedReport.
// Pure — no DB deps; unit-tested in normalize.test.ts.

import type { ReportCategory, ReportStatus } from "@/lib/types";
import type { NormalizedReport } from "@/lib/onboarding/ingest/types";
import { parseCsvReports } from "@/lib/onboarding/ingest/csv";
import type { CsvConfig } from "@/lib/onboarding/ingest/csv";
import type { Result } from "@/lib/types";

export type ImportSource = "csv" | "seeclickfix_json";

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/** Default CSV column mapping for a generic 311 export. */
export const DEFAULT_CSV_CONFIG: CsvConfig = {
  lngField: "longitude",
  latField: "latitude",
  categoryField: "category",
  categoryMap: {
    pothole: "pothole",
    "street light": "streetlight",
    streetlight: "streetlight",
    "downed sign": "downed_sign",
    graffiti: "graffiti",
    "illegal dump": "illegal_dump",
    "water leak": "water_leak",
    "sidewalk damage": "sidewalk_damage",
    "tree down": "tree_down",
    debris: "debris",
    drainage: "drainage",
    "faded signage": "faded_signage",
    other: "other",
  },
  statusField: "status",
  statusMap: {
    open: "open",
    closed: "closed",
    "in progress": "in_progress",
    in_progress: "in_progress",
    dispatched: "dispatched",
    merged: "merged",
    rejected: "rejected",
  },
  dateField: "created_at",
  idField: "id",
  addressField: "address",
  severityField: "severity",
};

// ---------------------------------------------------------------------------
// SeeClickFix JSON import (batch — the kind you export via their CSV/JSON tool)
// ---------------------------------------------------------------------------

interface ScfJsonRow {
  id?: number | string;
  status?: string;
  address?: string;
  lat?: number | string;
  lng?: number | string;
  longitude?: number | string;
  latitude?: number | string;
  created_at?: string;
  request_type?: { title?: string } | string;
  [key: string]: unknown;
}

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
]);

function mapScfStatus(raw: unknown): ReportStatus {
  const s = String(raw ?? "").toLowerCase().replace(/\s+/g, "_");
  if (VALID_STATUSES.has(s)) return s as ReportStatus;
  const closed = s === "closed" || s === "archived" || s === "closed-unresolved";
  return closed ? "closed" : "open";
}

function parseDate(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function mapScfCategory(raw: unknown): ReportCategory {
  const title =
    typeof raw === "string"
      ? raw
      : typeof (raw as ScfJsonRow["request_type"]) === "object" && raw !== null
        ? String((raw as { title?: string }).title ?? "")
        : String(raw ?? "");
  const key = title.toLowerCase().trim();
  const map: Record<string, ReportCategory> = {
    pothole: "pothole",
    "street light": "streetlight",
    streetlight: "streetlight",
    "street light outage": "streetlight",
    graffiti: "graffiti",
    "illegal dumping": "illegal_dump",
    "water leak": "water_leak",
    "sidewalk damage": "sidewalk_damage",
    "fallen tree": "tree_down",
    "tree debris": "debris",
    debris: "debris",
    drainage: "drainage",
    "sign damage": "downed_sign",
  };
  return map[key] ?? "other";
}

/** Normalize a single raw record from a SeeClickFix JSON export. */
export function mapLegacyRecord(
  row: Record<string, unknown>,
  source: ImportSource,
): NormalizedReport | null {
  if (source === "seeclickfix_json") {
    const r = row as ScfJsonRow;
    const lat = Number(r.lat ?? r.latitude);
    const lng = Number(r.lng ?? r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      source: "open311", // schema constraint; raw is preserved for reference
      sourceExternalId: r.id != null ? String(r.id) : undefined,
      location: { lat, lng },
      category: mapScfCategory(r.request_type),
      severity: 3,
      status: mapScfStatus(r.status),
      createdAt: parseDate(r.created_at) ?? new Date().toISOString(),
      address: typeof r.address === "string" ? r.address : undefined,
      raw: r,
    };
  }
  // csv: caller should use parseCsvReports directly (see importFromText)
  return null;
}

// ---------------------------------------------------------------------------
// Top-level entry point — parse raw text (CSV or JSON) into NormalizedReport[]
// ---------------------------------------------------------------------------

/**
 * Parse uploaded text (CSV or JSON) and return normalized reports.
 * For CSV: uses DEFAULT_CSV_CONFIG; callers may pass a custom config.
 * For SeeClickFix JSON: expects either a JSON array or { issues: [...] }.
 */
export function importFromText(
  text: string,
  source: ImportSource,
  csvConfig?: CsvConfig,
): Result<NormalizedReport[]> {
  if (source === "csv") {
    return parseCsvReports(text, csvConfig ?? DEFAULT_CSV_CONFIG);
  }

  if (source === "seeclickfix_json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    const rows: unknown[] =
      Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as Record<string, unknown>)?.issues)
          ? (parsed as { issues: unknown[] }).issues
          : [];

    if (rows.length === 0) {
      return { ok: true, data: [] };
    }

    const out: NormalizedReport[] = [];
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const normalized = mapLegacyRecord(row as Record<string, unknown>, source);
      if (normalized) out.push(normalized);
    }
    return { ok: true, data: out };
  }

  return { ok: false, error: `unknown_source: ${source}` };
}
