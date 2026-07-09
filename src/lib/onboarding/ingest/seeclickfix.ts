// SeeClickFix import adapter (NEXT_100 #81) — de-risks switching off the #1
// citizen-311 incumbent by pulling a city's existing issue history into Civic.
// Uses SeeClickFix's native REST API v2 (richer than its Open311 mirror: real
// status vocabulary, vote counts, full-size media) and normalizes to the
// adapter-agnostic NormalizedReport the writer already consumes.
//
// NOTE on `source`: reports.source is constrained (migration 024) to a fixed set
// that does not include 'seeclickfix'. SeeClickFix IS an Open311 provider, so we
// tag imports 'open311' to stay schema-valid without a migration; the native
// SeeClickFix payload is preserved verbatim in `raw` (votes, request_type, org)
// for anyone who later adds a dedicated source + a votes → upvotes backfill.

import { createLogger } from "@/lib/logger";
import type { ReportCategory, ReportStatus, Result } from "@/lib/types";
import type { NormalizedReport } from "./types";

const logger = createLogger("ingest-seeclickfix");

export interface SeeClickFixConfig {
  /** API base, defaults to the public host. Override for on-prem/regional. */
  baseUrl?: string;
  /** City slug on SeeClickFix, e.g. "cumming-georgia" — the `place_url` param. */
  placeUrl: string;
  /** request_type.title (lowercased) → Civic category. Miss → 'other'. */
  categoryMap: Record<string, ReportCategory>;
  perPage?: number;
  maxRecords?: number;
}

type FetchLike = typeof fetch;

interface ScfIssue {
  id?: number | string;
  status?: string;
  summary?: string;
  description?: string;
  address?: string;
  lat?: number | string;
  lng?: number | string;
  created_at?: string;
  updated_at?: string;
  rating?: number;
  media?: { image_full?: string | null } | null;
  request_type?: { title?: string; organization?: string } | null;
}

interface ScfResponse {
  issues?: ScfIssue[];
  metadata?: {
    pagination?: { page?: number; pages?: number; next_page?: number | null };
  };
}

// SeeClickFix statuses: Open | Acknowledged | Closed | Archived. Only the last
// two are terminal; everything else maps to an open Civic report.
function mapStatus(raw: unknown): ReportStatus {
  const s = String(raw ?? "").toLowerCase();
  return s === "closed" || s === "archived" ? "closed" : "open";
}

function parseDate(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function mapIssue(
  issue: ScfIssue,
  cfg: SeeClickFixConfig,
  now: number,
): NormalizedReport | null {
  const lat = Number(issue.lat);
  const lng = Number(issue.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const key = String(issue.request_type?.title ?? "")
    .toLowerCase()
    .trim();
  const category: ReportCategory = cfg.categoryMap[key] ?? "other";
  const status = mapStatus(issue.status);
  const createdAt = parseDate(issue.created_at) ?? new Date(now).toISOString();
  const resolvedAt =
    status === "closed"
      ? (parseDate(issue.updated_at) ?? undefined)
      : undefined;

  return {
    source: "open311",
    sourceExternalId: issue.id != null ? String(issue.id) : undefined,
    location: { lng, lat },
    category,
    severity: 3,
    status,
    createdAt,
    resolvedAt,
    address:
      issue.address != null && String(issue.address).trim()
        ? String(issue.address)
        : undefined,
    photoUrl: issue.media?.image_full ?? undefined,
    raw: issue as Record<string, unknown>,
  };
}

/**
 * Pull a SeeClickFix place's issues → NormalizedReport[]. Paginates via the
 * response metadata's next_page until exhausted or maxRecords is hit. Pure HTTP;
 * fetch injectable for tests.
 */
export async function fetchSeeClickFixReports(
  cfg: SeeClickFixConfig,
  fetchImpl: FetchLike = fetch,
  now: number = Date.now(),
): Promise<Result<NormalizedReport[]>> {
  const base = (cfg.baseUrl ?? "https://seeclickfix.com/api/v2").replace(
    /\/$/,
    "",
  );
  const perPage = cfg.perPage ?? 100;
  const maxRecords = cfg.maxRecords ?? 5000;
  const out: NormalizedReport[] = [];
  let page = 1;

  while (out.length < maxRecords) {
    const qs = new URLSearchParams({
      place_url: cfg.placeUrl,
      page: String(page),
      per_page: String(perPage),
    });

    let json: ScfResponse;
    try {
      const res = await fetchImpl(`${base}/issues?${qs.toString()}`);
      if (!res.ok)
        return { ok: false, error: `SeeClickFix HTTP ${res.status}` };
      json = (await res.json()) as ScfResponse;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "SeeClickFix fetch failed",
      };
    }

    const issues = Array.isArray(json.issues) ? json.issues : [];
    for (const issue of issues) {
      const mapped = mapIssue(issue, cfg, now);
      if (mapped) out.push(mapped);
      if (out.length >= maxRecords) break;
    }

    const nextPage = json.metadata?.pagination?.next_page;
    if (issues.length === 0 || nextPage == null) break; // last page
    page = nextPage;
  }

  if (out.length >= maxRecords) {
    logger.warn("seeclickfix_max_records_hit", {
      placeUrl: cfg.placeUrl,
      maxRecords,
    });
  }

  return { ok: true, data: out };
}
