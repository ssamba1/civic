import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { ReportStatus } from "@/lib/types";

const log = createLogger("db-crew-workloads");

/** Per-crew workload rollup over its assigned work orders. Record (not Map) so
 *  it survives RSC → client prop serialization intact. */
export interface CrewWorkload {
  crewId: string;
  total: number;
  byStatus: Record<ReportStatus, number>;
  openCount: number;
  closedCount: number;
  oldestOpenAgeDays: number | null;
  mttrHours: number | null;
}
// Record not Map — RSC prop serialization
export type CrewWorkloadsResult =
  | { ok: true; workloads: Record<string, CrewWorkload> }
  | { ok: false; error: string };

// Backlog = not yet resolved; mirrors teams-data.ts's BACKLOG_STATUSES.
const BACKLOG_STATUSES: ReadonlyArray<ReportStatus> = [
  "open",
  "dispatched",
  "in_progress",
];

const EMPTY_STATUS_COUNTS: Record<ReportStatus, number> = {
  open: 0,
  dispatched: 0,
  in_progress: 0,
  closed: 0,
  merged: 0,
  rejected: 0,
};

// PostgREST rows come back untyped from the service client; this is the
// columns/embed the query below selects, cast at the boundary. reports is
// embedded FROM work_orders via report_id and — like lib/db/calendar.ts's
// embed — comes back as a single object/null despite supabase-js inferring an
// array for a child embedding its parent this way.
interface CrewWorkloadRowRaw {
  assigned_crew_id: string | null;
  created_at: string;
  completed_at: string | null;
  reports: {
    status: string;
    created_at: string;
    city_id: string;
  } | null;
}

function emptyWorkload(crewId: string): CrewWorkload {
  return {
    crewId,
    total: 0,
    byStatus: { ...EMPTY_STATUS_COUNTS },
    openCount: 0,
    closedCount: 0,
    oldestOpenAgeDays: null,
    mttrHours: null,
  };
}

/**
 * Aggregate work-order rows into per-crew workload metrics in a single pass,
 * keyed by assigned_crew_id. Mirrors teams-data.ts's aggregateByTeam.
 *
 * MTTR is a mean of real `(completed_at − report.created_at)` hours over
 * completed rows — unlike aggregateByTeam, which synthesizes from severity
 * because its mock corpus has no completion timestamp. Ages and MTTR are
 * rounded the same way teams-data does (MTTR to whole hours, ages left raw).
 */
export function aggregateCrewWorkloads(
  rows: ReadonlyArray<CrewWorkloadRowRaw>,
  now = Date.now(),
): Record<string, CrewWorkload> {
  const result: Record<string, CrewWorkload> = {};
  const mttrSums = new Map<string, { sumH: number; n: number }>();

  for (const row of rows) {
    const crewId = row.assigned_crew_id;
    if (!crewId) continue; // query filters these out; defensive only
    const report = row.reports;
    if (!report) continue; // reports!inner guarantees this; defensive only
    const status = report.status as ReportStatus;

    let bucket = result[crewId];
    if (!bucket) {
      bucket = emptyWorkload(crewId);
      result[crewId] = bucket;
    }

    bucket.total += 1;
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;

    if (BACKLOG_STATUSES.includes(status)) {
      bucket.openCount += 1;
      const ageDays = (now - Date.parse(report.created_at)) / 86_400_000;
      if (
        bucket.oldestOpenAgeDays === null ||
        ageDays > bucket.oldestOpenAgeDays
      ) {
        bucket.oldestOpenAgeDays = ageDays;
      }
    }

    if (status === "closed") bucket.closedCount += 1;

    if (row.completed_at) {
      const hours =
        (Date.parse(row.completed_at) - Date.parse(report.created_at)) /
        3_600_000;
      const m = mttrSums.get(crewId) ?? { sumH: 0, n: 0 };
      m.sumH += hours;
      m.n += 1;
      mttrSums.set(crewId, m);
    }
  }

  for (const [crewId, m] of mttrSums) {
    const bucket = result[crewId];
    if (bucket && m.n > 0) bucket.mttrHours = Math.round(m.sumH / m.n);
  }

  return result;
}

/**
 * Per-crew workload metrics for one city's assigned work orders. Service-role
 * client — call only behind a staff-access gate, same as fetchCityCrews.
 * Never throws: any failure (un-migrated DB, query error) returns a tagged
 * error so the members page still renders its crew panel.
 */
export async function fetchCrewWorkloads(
  cityId: string,
  now = Date.now(),
): Promise<CrewWorkloadsResult> {
  try {
    const db = createServerClient();

    const { data, error } = await db
      .from("work_orders")
      .select(
        "assigned_crew_id, created_at, completed_at, reports!inner(status, created_at, city_id)",
      )
      .eq("reports.city_id", cityId)
      .not("assigned_crew_id", "is", null);

    if (error) {
      log.error("crew workloads query failed", error, { cityId });
      return { ok: false, error: "crew_workloads_query_failed" };
    }

    const rows = (data ?? []) as unknown as CrewWorkloadRowRaw[];
    return { ok: true, workloads: aggregateCrewWorkloads(rows, now) };
  } catch (err) {
    log.error("fetchCrewWorkloads threw", err, { cityId });
    return { ok: false, error: "crew_workloads_query_failed" };
  }
}
