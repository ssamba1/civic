import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import { type GeoPoint, normalizeLocation, type Result } from "@/lib/types";
import { MATCH_TOLERANCE_M } from "./config";
import type { CapitalJobRow, UtilityPermitRow, WarrantyRow } from "./types";

/**
 * Candidate queries for the liability join (spec §3.2). Service client: the
 * evaluation runs fire-and-forget after report submission, outside any request
 * cookie context.
 *
 * The two spatial lookups go through PostGIS RPCs because PostgREST filters
 * cannot express ST_DWithin, and app-side distance math is banned (agents.md
 * rule #7). Migration 062 owns the DDL; these are the function signatures this
 * module calls:
 *
 *   liability_candidate_jobs(_city_id uuid, _lng float8, _lat float8,
 *                            _tolerance_m float8, _as_of date)
 *     -> TABLE (id uuid, contractor_id uuid, contract_ref text, job_type text,
 *               completed_at date, source text, distance_m double precision)
 *     WHERE city_id = _city_id
 *       AND ST_DWithin(footprint, ST_MakePoint(_lng,_lat)::geography, _tolerance_m)
 *       AND completed_at <= _as_of
 *     ORDER BY distance_m
 *
 *   liability_candidate_permits(_city_id uuid, _lng float8, _lat float8,
 *                               _tolerance_m float8, _as_of date)
 *     -> TABLE (id uuid, permittee_name text, permittee_contractor_id uuid,
 *               permit_ref text, liability_ends_on date,
 *               distance_m double precision)
 *     WHERE city_id = _city_id
 *       AND ST_DWithin(trench, ST_MakePoint(_lng,_lat)::geography, _tolerance_m)
 *     ORDER BY distance_m
 *
 * Every fetch returns a Result: an RPC failure must never be collapsed into
 * "no candidates", because that would be read downstream as a `city_cost`
 * verdict, the exact silent-failure trap spec §3.2 step 6 forbids.
 */

const logger = createLogger("liability-db");

export interface LiabilityReportRow {
  id: string;
  cityId: string;
  createdAt: string;
  category: string;
  location: GeoPoint;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** UTC calendar date of a timestamp. The warranty clock is a date, not an instant. */
export function toDateOnly(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Report fields the liability join needs. Category comes from the
 * classification row; a report classified as `other` (or not yet classified)
 * still evaluates. It just cannot score category compatibility.
 */
export async function fetchReportForLiability(
  reportId: string,
): Promise<Result<LiabilityReportRow>> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("reports")
      .select("id, city_id, created_at, location, classifications(category)")
      .eq("id", reportId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "report_not_found" };

    const row = data as unknown as {
      id: string;
      city_id: string | null;
      created_at: string;
      location: unknown;
      // PostgREST returns an embedded 1:1 relation as an object or an array
      // depending on how the FK is detected, normalize both shapes.
      classifications:
        | { category: string | null }
        | { category: string | null }[]
        | null;
    };
    const location = normalizeLocation(row.location);
    if (!row.city_id) return { ok: false, error: "report_has_no_city" };
    if (!location) return { ok: false, error: "report_has_no_location" };

    const cls = Array.isArray(row.classifications)
      ? row.classifications[0]
      : row.classifications;

    return {
      ok: true,
      data: {
        id: row.id,
        cityId: row.city_id,
        createdAt: row.created_at,
        category: cls?.category ?? "other",
        location,
      },
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

/**
 * Does this city have ANY liability source data at all? Two cheap existence
 * probes decide `unknown` vs `city_cost` (spec §3.2 step 6). A probe that
 * errors (table not applied yet, RLS, network) is reported as a failure so the
 * caller can fall back to `unknown` rather than fabricating "city pays".
 */
export async function hasLiabilitySources(
  cityId: string,
): Promise<Result<boolean>> {
  try {
    const db = createServerClient();
    const probe = async (table: "capital_jobs" | "utility_permits") =>
      db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("city_id", cityId)
        .limit(1);

    const [jobs, permits] = await Promise.all([
      probe("capital_jobs"),
      probe("utility_permits"),
    ]);
    if (jobs.error) return { ok: false, error: jobs.error.message };
    if (permits.error) return { ok: false, error: permits.error.message };
    return {
      ok: true,
      data: (jobs.count ?? 0) > 0 || (permits.count ?? 0) > 0,
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

export async function fetchCandidateJobs(
  cityId: string,
  point: GeoPoint,
  asOfDate: string,
): Promise<Result<CapitalJobRow[]>> {
  try {
    const db = createServerClient();
    const { data, error } = await db.rpc("liability_candidate_jobs", {
      _city_id: cityId,
      _lng: point.lng,
      _lat: point.lat,
      _tolerance_m: MATCH_TOLERANCE_M,
      _as_of: asOfDate,
    });
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as CapitalJobRow[];
    return {
      ok: true,
      data: rows.map((r) => ({ ...r, distance_m: Number(r.distance_m) })),
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

/** Warranties attached to the candidate jobs. Window/category filtering is the
 *  pure function's job so it stays unit-testable without a DB. */
export async function fetchWarrantiesForJobs(
  jobIds: string[],
): Promise<Result<WarrantyRow[]>> {
  if (jobIds.length === 0) return { ok: true, data: [] };
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("warranties")
      .select(
        "id, capital_job_id, warranty_type, starts_on, ends_on, covers_categories",
      )
      .in("capital_job_id", jobIds);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data ?? []) as unknown as WarrantyRow[] };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

export async function fetchCandidatePermits(
  cityId: string,
  point: GeoPoint,
  asOfDate: string,
): Promise<Result<UtilityPermitRow[]>> {
  try {
    const db = createServerClient();
    const { data, error } = await db.rpc("liability_candidate_permits", {
      _city_id: cityId,
      _lng: point.lng,
      _lat: point.lat,
      _tolerance_m: MATCH_TOLERANCE_M,
      _as_of: asOfDate,
    });
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as UtilityPermitRow[];
    return {
      ok: true,
      data: rows.map((r) => ({ ...r, distance_m: Number(r.distance_m) })),
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

/** One row per report (report_id is the PK), so re-evaluation overwrites. */
export async function upsertReportLiability(
  reportId: string,
  row: {
    verdict: string;
    capital_job_id: string | null;
    warranty_id: string | null;
    utility_permit_id: string | null;
    liable_contractor_id: string | null;
    window_ends_on: string | null;
    match_distance_m: number | null;
    confidence: number;
  },
): Promise<Result<void>> {
  try {
    const db = createServerClient();
    const { error } = await db.from("report_liability").upsert(
      {
        report_id: reportId,
        ...row,
        evaluated_at: new Date().toISOString(),
        is_stale: false,
      },
      { onConflict: "report_id" },
    );
    if (error) {
      logger.warn("report_liability upsert failed", {
        reportId,
        error: error.message,
      });
      return { ok: false, error: error.message };
    }
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}
