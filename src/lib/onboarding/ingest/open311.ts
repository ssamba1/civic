// Open311 GeoReport v2 import adapter (F5) — for cities actually on SeeClickFix/
// CivicPlus/Open311 (sparse in the target band; the inverse of the export-only
// lib/open311/transform.ts). Pulls service requests → NormalizedReport[]. Pure
// HTTP; fetch injectable.

import { createLogger } from "@/lib/logger";
import type { ReportCategory, ReportStatus, Result } from "@/lib/types";
import type { NormalizedReport } from "./types";

const logger = createLogger("ingest-open311");

export interface Open311Config {
  /** GeoReport v2 base, e.g. https://city.gov/open311/v2 — we GET /requests.json */
  url: string;
  /** service_code / service_name (lowercased) → Civic category. Miss → 'other'. */
  categoryMap: Record<string, ReportCategory>;
  jurisdictionId?: string;
  pageSize?: number;
  maxRecords?: number;
}

type FetchLike = typeof fetch;

interface Open311Request {
  service_request_id?: string | number;
  service_code?: string;
  service_name?: string;
  status?: string;
  requested_datetime?: string;
  updated_datetime?: string;
  address?: string;
  lat?: string | number;
  long?: string | number;
  media_url?: string;
}

function parseDate(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function mapRequest(
  r: Open311Request,
  cfg: Open311Config,
  now: number,
): NormalizedReport | null {
  const lat = Number(r.lat);
  const lng = Number(r.long);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = String(r.service_code ?? r.service_name ?? "")
    .toLowerCase()
    .trim();
  const category: ReportCategory = cfg.categoryMap[key] ?? "other";
  // GeoReport v2 status vocabulary is just open | closed.
  const status: ReportStatus = r.status === "closed" ? "closed" : "open";
  const createdAt =
    parseDate(r.requested_datetime) ?? new Date(now).toISOString();
  const resolvedAt =
    status === "closed"
      ? (parseDate(r.updated_datetime) ?? undefined)
      : undefined;

  return {
    source: "open311",
    sourceExternalId:
      r.service_request_id != null ? String(r.service_request_id) : undefined,
    location: { lng, lat },
    category,
    severity: 3,
    status,
    createdAt,
    resolvedAt,
    address:
      r.address != null && String(r.address).trim()
        ? String(r.address)
        : undefined,
    photoUrl: r.media_url,
    raw: r as Record<string, unknown>,
  };
}

export async function fetchOpen311Reports(
  cfg: Open311Config,
  fetchImpl: FetchLike = fetch,
  now: number = Date.now(),
): Promise<Result<NormalizedReport[]>> {
  const pageSize = cfg.pageSize ?? 100;
  const maxRecords = cfg.maxRecords ?? 5000;
  const out: NormalizedReport[] = [];
  let page = 1;

  while (out.length < maxRecords) {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (cfg.jurisdictionId) qs.set("jurisdiction_id", cfg.jurisdictionId);

    let rows: Open311Request[];
    try {
      const res = await fetchImpl(`${cfg.url}/requests.json?${qs.toString()}`);
      if (!res.ok) return { ok: false, error: `Open311 HTTP ${res.status}` };
      const json = await res.json();
      rows = Array.isArray(json) ? (json as Open311Request[]) : [];
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Open311 fetch failed",
      };
    }

    for (const r of rows) {
      const mapped = mapRequest(r, cfg, now);
      if (mapped) out.push(mapped);
      if (out.length >= maxRecords) break;
    }

    if (rows.length < pageSize) break; // last page
    page += 1;
  }

  if (out.length >= maxRecords) {
    logger.warn("open311_max_records_hit", { url: cfg.url, maxRecords });
  }

  return { ok: true, data: out };
}
