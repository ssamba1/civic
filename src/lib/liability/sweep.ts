import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

/**
 * Warranty expiry sweep (spec §3.4): capital jobs whose warranty lapses inside
 * the horizon, each with the count of still-open defects attributed to it.
 * Converts "we forgot" into a worklist, highest-ROI screen in the spec.
 *
 * The row shaping is a pure function so the ordering and day math are testable
 * without a DB; only `fetchExpiringWarranties` touches Postgres.
 */

const logger = createLogger("liability-sweep");

const MS_PER_DAY = 86_400_000;

/** The embedded capital_jobs shape PostgREST returns alongside a warranty. */
export interface ExpiringWarrantyJob {
  id: string;
  contract_ref: string | null;
  job_type: string;
  completed_at: string;
  contractor_id: string | null;
}

export interface ExpiringWarrantyJoinRow {
  id: string;
  warranty_type: string;
  ends_on: string;
  capital_job_id: string;
  // PostgREST returns an embedded to-one relation as an object or a
  // single-element array depending on FK detection. Both shapes are accepted.
  capital_jobs: ExpiringWarrantyJob | ExpiringWarrantyJob[] | null;
}

export interface ExpiringWarranty {
  warrantyId: string;
  warrantyType: string;
  endsOn: string;
  daysRemaining: number;
  capitalJobId: string;
  contractRef: string | null;
  jobType: string;
  completedAt: string;
  contractorId: string | null;
  contractorName: string | null;
  openReportCount: number;
}

/** Whole calendar days from `today` to `date`, both `YYYY-MM-DD`. Negative once lapsed. */
export function daysUntil(today: string, date: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

export function tallyOpenReportsByJob(
  rows: { capital_job_id: string | null }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.capital_job_id) continue;
    counts[row.capital_job_id] = (counts[row.capital_job_id] ?? 0) + 1;
  }
  return counts;
}

/** Soonest expiry first; within a day, the jobs with the most open defects. */
export function shapeExpiringWarranties(
  rows: ExpiringWarrantyJoinRow[],
  openCounts: Record<string, number>,
  contractorNames: Record<string, string>,
  today: string,
): ExpiringWarranty[] {
  const shaped: ExpiringWarranty[] = [];
  for (const row of rows) {
    const job = Array.isArray(row.capital_jobs)
      ? row.capital_jobs[0]
      : row.capital_jobs;
    if (!job) continue;
    shaped.push({
      warrantyId: row.id,
      warrantyType: row.warranty_type,
      endsOn: row.ends_on,
      daysRemaining: daysUntil(today, row.ends_on),
      capitalJobId: job.id,
      contractRef: job.contract_ref,
      jobType: job.job_type,
      completedAt: job.completed_at,
      contractorId: job.contractor_id,
      contractorName: job.contractor_id
        ? (contractorNames[job.contractor_id] ?? null)
        : null,
      openReportCount: openCounts[job.id] ?? 0,
    });
  }
  return shaped.sort(
    (a, b) =>
      a.daysRemaining - b.daysRemaining ||
      b.openReportCount - a.openReportCount,
  );
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Warranties for `cityId` lapsing within `horizonDays` (already-lapsed windows
 * excluded), with their open defect counts. Returns ok:false on a query error
 * so the admin screen can say "couldn't load" instead of showing a falsely
 * empty worklist.
 */
export async function fetchExpiringWarranties(
  cityId: string,
  horizonDays: number,
): Promise<Result<ExpiringWarranty[]>> {
  if (!cityId) return { ok: true, data: [] };
  const today = todayUtc();
  const horizon = new Date(
    Date.parse(`${today}T00:00:00Z`) + horizonDays * MS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("warranties")
      .select(
        "id, warranty_type, ends_on, capital_job_id, capital_jobs!inner(id, contract_ref, job_type, completed_at, contractor_id, city_id)",
      )
      .eq("capital_jobs.city_id", cityId)
      .gte("ends_on", today)
      .lte("ends_on", horizon)
      .order("ends_on");
    if (error) {
      logger.warn("expiring warranties query failed", {
        cityId,
        error: error.message,
      });
      return { ok: false, error: error.message };
    }

    const rows = (data ?? []) as unknown as ExpiringWarrantyJoinRow[];
    const jobIds = rows
      .map((r) =>
        Array.isArray(r.capital_jobs)
          ? r.capital_jobs[0]?.id
          : r.capital_jobs?.id,
      )
      .filter((id): id is string => Boolean(id));

    const [openCounts, contractorNames] = await Promise.all([
      fetchOpenReportCounts(jobIds),
      fetchContractorNames(rows),
    ]);

    return {
      ok: true,
      data: shapeExpiringWarranties(rows, openCounts, contractorNames, today),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("expiring warranties threw", { cityId, error: message });
    return { ok: false, error: message };
  }
}

/** Open defects attributed to each capital job, via report_liability -> reports. */
async function fetchOpenReportCounts(
  jobIds: string[],
): Promise<Record<string, number>> {
  if (jobIds.length === 0) return {};
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("report_liability")
      .select("capital_job_id, reports!inner(status)")
      .in("capital_job_id", jobIds)
      .in("reports.status", ["open", "dispatched", "in_progress"]);
    if (error) {
      logger.warn("open report count query failed", { error: error.message });
      return {};
    }
    return tallyOpenReportsByJob(
      (data ?? []) as unknown as { capital_job_id: string | null }[],
    );
  } catch {
    return {};
  }
}

async function fetchContractorNames(
  rows: ExpiringWarrantyJoinRow[],
): Promise<Record<string, string>> {
  const ids = Array.from(
    new Set(
      rows
        .map((r) =>
          Array.isArray(r.capital_jobs)
            ? r.capital_jobs[0]?.contractor_id
            : r.capital_jobs?.contractor_id,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (ids.length === 0) return {};
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("contractors")
      .select("id, name")
      .in("id", ids);
    if (error) {
      logger.warn("contractor name lookup failed", { error: error.message });
      return {};
    }
    const names: Record<string, string> = {};
    for (const row of (data ?? []) as { id: string; name: string }[]) {
      names[row.id] = row.name;
    }
    return names;
  } catch {
    return {};
  }
}
