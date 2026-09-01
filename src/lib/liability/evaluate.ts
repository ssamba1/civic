import "server-only";

import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";
import { CATEGORY_JOB_COMPAT, MATCH_TOLERANCE_M } from "./config";
import {
  fetchCandidateJobs,
  fetchCandidatePermits,
  fetchReportForLiability,
  fetchWarrantiesForJobs,
  hasLiabilitySources,
  toDateOnly,
  upsertReportLiability,
} from "./db";
import type {
  CapitalJobRow,
  LiabilityEvaluation,
  LiabilityReportInput,
  UtilityPermitRow,
  WarrantyRow,
} from "./types";

const logger = createLogger("liability-evaluate");

/** How much a footprint's provenance is trusted: a surveyed GIS geometry beats
 *  a spreadsheet import, which beats a hand-drawn sketch. */
const SOURCE_SCORE: Record<CapitalJobRow["source"], number> = {
  arcgis: 1,
  csv: 0.7,
  manual: 0.5,
};

const UNMATCHED: Omit<LiabilityEvaluation, "verdict" | "confidence"> = {
  capitalJobId: null,
  warrantyId: null,
  utilityPermitId: null,
  liableContractorId: null,
  windowEndsOn: null,
  matchDistanceM: null,
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function distanceScore(distanceM: number): number {
  return clamp01(1 - distanceM / MATCH_TOLERANCE_M);
}

function compatScore(category: string, jobType: string): number {
  return CATEGORY_JOB_COMPAT[category]?.includes(jobType) ? 1 : 0;
}

/** Spec §3.3-50% distance, 30% category/job-type compatibility, 20% footprint
 *  provenance. Visible in the UI, never a bare "contractor liable". */
function confidenceFor(
  distanceM: number,
  compat: number,
  source: number,
): number {
  return clamp01(0.5 * distanceScore(distanceM) + 0.3 * compat + 0.2 * source);
}

/** Nearest first; ties broken by the most recently completed job (§3.2 step 5). */
function byDistanceThenRecency(a: CapitalJobRow, b: CapitalJobRow): number {
  if (a.distance_m !== b.distance_m) return a.distance_m - b.distance_m;
  return b.completed_at.localeCompare(a.completed_at);
}

/**
 * The liability join, as a pure function over candidate DB rows (spec §3.2).
 *
 * `jobs` and `permits` are expected to be pre-filtered by the spatial query
 * (within MATCH_TOLERANCE_M of the report). Date and category filtering happens
 * here so precedence and confidence stay unit-testable without a live DB.
 *
 * Precedence when both hit: utility_restoration > contractor_warranty. A trench
 * cut through new pavement is the permittee's failure, and paving contracts
 * routinely exclude third-party cuts. Documented default, not silently
 * hardcoded, the test suite locks it.
 */
export function pickVerdict(
  jobs: CapitalJobRow[],
  warranties: WarrantyRow[],
  permits: UtilityPermitRow[],
  report: LiabilityReportInput,
): LiabilityEvaluation {
  const asOf = toDateOnly(report.createdAt);

  // 3. Utility permits still inside their restoration liability window.
  const livePermits = permits
    .filter((p) => p.liability_ends_on !== null && asOf <= p.liability_ends_on)
    .sort((a, b) => a.distance_m - b.distance_m);

  if (livePermits.length > 0) {
    const permit = livePermits[0];
    return {
      ...UNMATCHED,
      verdict: "utility_restoration",
      utilityPermitId: permit.id,
      liableContractorId: permit.permittee_contractor_id,
      windowEndsOn: permit.liability_ends_on,
      matchDistanceM: permit.distance_m,
      // A permit row carries no job-type or surveyed-geometry signal, so the
      // compatibility term is 1 (restoration liability is category-agnostic)
      // and provenance scores as a manual footprint.
      confidence: confidenceFor(permit.distance_m, 1, SOURCE_SCORE.manual),
    };
  }

  // 1 + 2. Capital jobs completed before the report, with a warranty covering
  // the report's date and category.
  const eligibleJobs = jobs
    .filter((j) => j.completed_at <= asOf)
    .sort(byDistanceThenRecency);

  for (const job of eligibleJobs) {
    const warranty = warranties.find(
      (w) =>
        w.capital_job_id === job.id &&
        w.starts_on <= asOf &&
        asOf <= w.ends_on &&
        (w.covers_categories === null ||
          w.covers_categories.includes(report.category)),
    );
    if (!warranty) continue;
    return {
      ...UNMATCHED,
      verdict: "contractor_warranty",
      capitalJobId: job.id,
      warrantyId: warranty.id,
      liableContractorId: job.contractor_id,
      windowEndsOn: warranty.ends_on,
      matchDistanceM: job.distance_m,
      confidence: confidenceFor(
        job.distance_m,
        compatScore(report.category, job.job_type),
        SOURCE_SCORE[job.source] ?? SOURCE_SCORE.manual,
      ),
    };
  }

  // 6. No hit. Only call it the city's bill when the city actually HAS source
  // data, an empty capital_jobs table reported as "city pays" is the
  // silent-failure trap spec §3.2 calls out by name.
  return report.hasSourceData
    ? { ...UNMATCHED, verdict: "city_cost", confidence: 0.5 }
    : { ...UNMATCHED, verdict: "unknown", confidence: 0 };
}

/**
 * Evaluate one report and persist the verdict to `report_liability`.
 *
 * Best-effort by construction: every DB failure degrades to an `unknown`
 * verdict rather than a fabricated `city_cost`. Called fire-and-forget from
 * report submission. It must never block or fail a resident's report.
 */
export async function evaluateReportLiability(
  reportId: string,
): Promise<Result<LiabilityEvaluation>> {
  const reportRes = await fetchReportForLiability(reportId);
  if (!reportRes.ok) return reportRes;
  const report = reportRes.data;
  const asOf = toDateOnly(report.createdAt);

  const [sourcesRes, jobsRes, permitsRes] = await Promise.all([
    hasLiabilitySources(report.cityId),
    fetchCandidateJobs(report.cityId, report.location, asOf),
    fetchCandidatePermits(report.cityId, report.location, asOf),
  ]);

  // A failed probe or candidate query means we do not know what the sources
  // say. Treat it as "no source data" so the verdict lands on `unknown`.
  const degraded = !sourcesRes.ok || !jobsRes.ok || !permitsRes.ok;
  if (degraded) {
    logger.warn("liability candidate lookup degraded", {
      reportId,
      sources: sourcesRes.ok ? null : sourcesRes.error,
      jobs: jobsRes.ok ? null : jobsRes.error,
      permits: permitsRes.ok ? null : permitsRes.error,
    });
  }

  const jobs = jobsRes.ok ? jobsRes.data : [];
  const permits = permitsRes.ok ? permitsRes.data : [];

  const warrantiesRes = await fetchWarrantiesForJobs(jobs.map((j) => j.id));
  if (!warrantiesRes.ok) {
    logger.warn("warranty lookup failed", {
      reportId,
      error: warrantiesRes.error,
    });
  }

  const evaluation = pickVerdict(
    jobs,
    warrantiesRes.ok ? warrantiesRes.data : [],
    permits,
    {
      category: report.category,
      createdAt: report.createdAt,
      hasSourceData:
        !degraded && warrantiesRes.ok && sourcesRes.ok && sourcesRes.data,
    },
  );

  const written = await upsertReportLiability(reportId, {
    verdict: evaluation.verdict,
    capital_job_id: evaluation.capitalJobId,
    warranty_id: evaluation.warrantyId,
    utility_permit_id: evaluation.utilityPermitId,
    liable_contractor_id: evaluation.liableContractorId,
    window_ends_on: evaluation.windowEndsOn,
    match_distance_m: evaluation.matchDistanceM,
    confidence: evaluation.confidence,
  });
  if (!written.ok) return { ok: false, error: written.error };

  return { ok: true, data: evaluation };
}
