// CSV upload adapter (F5) — operator-uploaded 311 export → NormalizedReport[].
// The manual fallback when a city has no ArcGIS/Open311 source. Pure; no deps.
// Includes a small RFC-4180-ish parser (quoted fields, escaped quotes, CRLF).

import type { ReportCategory, ReportStatus, Result } from "@/lib/types";
import type { NormalizedReport } from "./types";

export interface CsvConfig {
  lngField: string;
  latField: string;
  categoryField: string;
  categoryMap: Record<string, ReportCategory>;
  statusField?: string;
  statusMap?: Record<string, ReportStatus>;
  dateField?: string;
  idField?: string;
  addressField?: string;
  severityField?: string;
}

const VALID_STATUS: ReadonlySet<string> = new Set([
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
]);

/** Parse CSV text into rows of fields. Handles "quoted, fields", "" escapes,
 *  and newlines inside quotes; tolerates \r\n and a trailing newline. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // swallow; \n handles the row break
    } else {
      field += c;
    }
  }
  // Flush the final field/row unless the file ended exactly on a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clampSeverity(value: string | undefined): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n)) as 1 | 2 | 3 | 4 | 5;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const asNum = Number(value);
  if (Number.isFinite(asNum) && value.trim() !== "") {
    return new Date(asNum).toISOString();
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Map uploaded CSV to NormalizedReport[]. Rows with missing/invalid coordinates
 * are skipped (not an error). Returns an error only when the header is missing
 * required columns.
 */
export function parseCsvReports(
  csvText: string,
  cfg: CsvConfig,
  now: number = Date.now(),
): Result<NormalizedReport[]> {
  const rows = parseCsv(csvText.trim());
  if (rows.length < 2) return { ok: true, data: [] };

  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const lngI = idx(cfg.lngField);
  const latI = idx(cfg.latField);
  const catI = idx(cfg.categoryField);
  if (lngI < 0 || latI < 0 || catI < 0) {
    return {
      ok: false,
      error: `CSV missing required column(s): ${cfg.lngField}, ${cfg.latField}, ${cfg.categoryField}`,
    };
  }
  const statusI = cfg.statusField ? idx(cfg.statusField) : -1;
  const dateI = cfg.dateField ? idx(cfg.dateField) : -1;
  const idI = cfg.idField ? idx(cfg.idField) : -1;
  const addrI = cfg.addressField ? idx(cfg.addressField) : -1;
  const sevI = cfg.severityField ? idx(cfg.severityField) : -1;

  const out: NormalizedReport[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length === 1 && cols[0].trim() === "") continue; // blank line
    const lng = Number(cols[lngI]);
    const lat = Number(cols[latI]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const rawCat = (cols[catI] ?? "").toLowerCase().trim();
    const category: ReportCategory = cfg.categoryMap[rawCat] ?? "other";

    let status: ReportStatus = "open";
    if (statusI >= 0 && cfg.statusMap) {
      const mapped = cfg.statusMap[(cols[statusI] ?? "").toLowerCase().trim()];
      if (mapped && VALID_STATUS.has(mapped)) status = mapped;
    }

    const addr = addrI >= 0 ? cols[addrI]?.trim() : undefined;

    out.push({
      source: "csv",
      sourceExternalId: idI >= 0 && cols[idI] ? cols[idI] : undefined,
      location: { lng, lat },
      category,
      severity: sevI >= 0 ? clampSeverity(cols[sevI]) : 3,
      status,
      createdAt:
        (dateI >= 0 ? parseDate(cols[dateI]) : null) ??
        new Date(now).toISOString(),
      address: addr ? addr : undefined,
    });
  }
  return { ok: true, data: out };
}
