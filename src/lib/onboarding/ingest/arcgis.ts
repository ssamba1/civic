// ArcGIS Feature Service adapter (F5) — the primary real-data channel for the GA
// beachhead (ONBOARDING.md §10: GA 311 lives on ArcGIS, not Socrata). Pulls a
// city's 311 / work-order layer over the standard REST query API, paginates, and
// maps source rows → NormalizedReport. Pure HTTP; `fetchImpl` injectable.
//
// Per-city schemas differ, so field names + value maps are passed via ArcGisConfig.

import { createLogger } from "@/lib/logger";
import type { ReportCategory, ReportStatus, Result } from "@/lib/types";
import type { NormalizedReport } from "./types";

const logger = createLogger("ingest-arcgis");

export interface ArcGisConfig {
  /** Feature layer base, e.g. https://services.arcgis.com/XXX/.../FeatureServer/0 */
  url: string;
  categoryField: string;
  /** Lowercased source category value → Civic category. Misses → 'other'. */
  categoryMap: Record<string, ReportCategory>;
  statusField?: string;
  statusMap?: Record<string, ReportStatus>;
  /** Epoch-ms or ISO date field for createdAt. Missing → now. */
  dateField?: string;
  idField?: string;
  addressField?: string;
  severityField?: string;
  pageSize?: number;
  /** Safety cap on total rows pulled. Default 5000; a hit is logged, never silent. */
  maxRecords?: number;
}

type FetchLike = typeof fetch;

interface EsriFeature {
  attributes?: Record<string, unknown>;
  geometry?: { x?: number; y?: number } | null;
}

interface EsriQueryResponse {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
}

const VALID_STATUS: ReadonlySet<string> = new Set([
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
]);

// Web-Mercator (EPSG:3857) → WGS84. We request outSR=4326, but defensively
// unproject if a layer returns metres anyway (|x| way past 180°).
function toLngLat(x: number, y: number): { lng: number; lat: number } {
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return { lng: x, lat: y };
  const R = 6378137;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return { lng, lat };
}

function parseDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function clampSeverity(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n)) as 1 | 2 | 3 | 4 | 5;
}

function mapFeature(
  f: EsriFeature,
  cfg: ArcGisConfig,
  now: number,
): NormalizedReport | null {
  const a = f.attributes ?? {};
  const g = f.geometry;
  if (!g || typeof g.x !== "number" || typeof g.y !== "number") return null;
  const { lng, lat } = toLngLat(g.x, g.y);

  const rawCat = String(a[cfg.categoryField] ?? "")
    .toLowerCase()
    .trim();
  const category: ReportCategory = cfg.categoryMap[rawCat] ?? "other";

  let status: ReportStatus = "open";
  if (cfg.statusField && cfg.statusMap) {
    const rawStatus = String(a[cfg.statusField] ?? "")
      .toLowerCase()
      .trim();
    const mapped = cfg.statusMap[rawStatus];
    if (mapped && VALID_STATUS.has(mapped)) status = mapped;
  }

  const createdAt =
    (cfg.dateField ? parseDate(a[cfg.dateField]) : null) ??
    new Date(now).toISOString();

  const idVal = cfg.idField ? a[cfg.idField] : undefined;
  const addr = cfg.addressField ? a[cfg.addressField] : undefined;

  return {
    source: "arcgis",
    sourceExternalId: idVal != null ? String(idVal) : undefined,
    location: { lng, lat },
    category,
    severity: cfg.severityField ? clampSeverity(a[cfg.severityField]) : 3,
    status,
    createdAt,
    address: addr != null && String(addr).trim() ? String(addr) : undefined,
    raw: a,
  };
}

/**
 * Pull + normalize reports from an ArcGIS Feature Service. Paginates on
 * resultOffset until a short page or maxRecords. Returns [] (ok) when the layer
 * is empty; errors only on transport/HTTP failure.
 */
export async function fetchArcGisReports(
  cfg: ArcGisConfig,
  fetchImpl: FetchLike = fetch,
  now: number = Date.now(),
): Promise<Result<NormalizedReport[]>> {
  const pageSize = cfg.pageSize ?? 1000;
  const maxRecords = cfg.maxRecords ?? 5000;
  const out: NormalizedReport[] = [];
  let offset = 0;

  while (out.length < maxRecords) {
    const qs = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    let json: EsriQueryResponse;
    try {
      const res = await fetchImpl(`${cfg.url}/query?${qs.toString()}`);
      if (!res.ok) return { ok: false, error: `ArcGIS HTTP ${res.status}` };
      json = (await res.json()) as EsriQueryResponse;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "ArcGIS fetch failed",
      };
    }

    const features = json.features ?? [];
    for (const f of features) {
      const mapped = mapFeature(f, cfg, now);
      if (mapped) out.push(mapped);
      if (out.length >= maxRecords) break;
    }

    // Stop when the service signals no more rows or we got a short page.
    if (!json.exceededTransferLimit || features.length < pageSize) break;
    offset += pageSize;
  }

  if (out.length >= maxRecords) {
    logger.warn("arcgis_max_records_hit", {
      url: cfg.url,
      maxRecords,
      note: "import truncated — raise maxRecords to pull the full layer",
    });
  }

  return { ok: true, data: out };
}
