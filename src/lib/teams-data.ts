import type { CityStats, DashboardReport } from "@/lib/dashboard-data";
import { TEAM_LIST, type TeamId } from "@/lib/teams";
import type { ReportCategory, ReportStatus } from "@/lib/types";

/* ==================================================================
   Per-team workload aggregation.

   Pure derive over filtered reports. Threads a `getTeam(report)` arg so
   the caller decides whether to respect overrides. Keeps this module
   independent of localStorage / hooks.
   ================================================================== */

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

export interface TeamWorkload {
  teamId: TeamId;
  total: number;
  byStatus: Record<ReportStatus, number>;
  openCount: number;
  closedCount: number;
  oldestOpenAgeDays: number | null;
  mttrHours: number | null;
  topCategory: ReportCategory | null;
}

function emptyWorkload(teamId: TeamId): TeamWorkload {
  return {
    teamId,
    total: 0,
    byStatus: { ...EMPTY_STATUS_COUNTS },
    openCount: 0,
    closedCount: 0,
    oldestOpenAgeDays: null,
    mttrHours: null,
    topCategory: null,
  };
}

/**
 * Aggregate workload metrics per team in a single pass.
 *
 * MTTR is synthesized from severity (same formula as fetchCityStats) since
 * the mock corpus has no closed_at. When Supabase lands and reports gain
 * real `closed_at`, swap the per-report `12 + severity * 18` for
 * `(closed_at - created_at) / hour`.
 */
export function aggregateByTeam(
  reports: ReadonlyArray<DashboardReport>,
  getTeam: (r: DashboardReport) => TeamId,
  now = Date.now(),
): Map<TeamId, TeamWorkload> {
  const result = new Map<TeamId, TeamWorkload>();
  for (const team of TEAM_LIST) {
    if (team.id === "all") continue;
    result.set(team.id, emptyWorkload(team.id));
  }

  const categoryTallies = new Map<TeamId, Map<ReportCategory, number>>();
  const mttrSums = new Map<TeamId, { sumH: number; n: number }>();

  for (const r of reports) {
    const team = getTeam(r);
    if (team === "all") continue;

    let bucket = result.get(team);
    if (!bucket) {
      bucket = emptyWorkload(team);
      result.set(team, bucket);
    }

    bucket.total += 1;
    bucket.byStatus[r.status] = (bucket.byStatus[r.status] ?? 0) + 1;

    if (BACKLOG_STATUSES.includes(r.status)) {
      bucket.openCount += 1;
      const ageDays = (now - Date.parse(r.created_at)) / 86_400_000;
      if (
        bucket.oldestOpenAgeDays === null ||
        ageDays > bucket.oldestOpenAgeDays
      ) {
        bucket.oldestOpenAgeDays = ageDays;
      }
    }

    if (r.status === "closed") {
      bucket.closedCount += 1;
      const synthHours = 12 + r.severity * 18;
      const m = mttrSums.get(team) ?? { sumH: 0, n: 0 };
      m.sumH += synthHours;
      m.n += 1;
      mttrSums.set(team, m);
    }

    let cats = categoryTallies.get(team);
    if (!cats) {
      cats = new Map();
      categoryTallies.set(team, cats);
    }
    cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
  }

  for (const [teamId, bucket] of result) {
    const cats = categoryTallies.get(teamId);
    if (cats && cats.size > 0) {
      let topCat: ReportCategory | null = null;
      let topCount = -1;
      for (const [cat, count] of cats) {
        if (count > topCount) {
          topCount = count;
          topCat = cat;
        }
      }
      bucket.topCategory = topCat;
    }
    const m = mttrSums.get(teamId);
    if (m && m.n > 0) {
      bucket.mttrHours = Math.round(m.sumH / m.n);
    }
  }

  return result;
}

/**
 * Per-team CityStats, derived from one team's reports using the same
 * synthetic formulas fetchCityStats applies to the city aggregate, so the
 * team dashboard's stat cards read consistently with the city view. `now`
 * is threaded in (server-seeded) so week buckets don't drift across renders.
 */
export function computeTeamStats(
  reports: ReadonlyArray<DashboardReport>,
  now = Date.now(),
): CityStats {
  let open = 0;
  let resolved = 0;
  let this_week = 0;
  let prev_week = 0;
  let mttrSum = 0;
  for (const r of reports) {
    if (r.status === "open") open += 1;
    if (r.status === "closed") {
      resolved += 1;
      mttrSum += 12 + r.severity * 18;
    }
    const ageDays = (now - Date.parse(r.created_at)) / 86_400_000;
    if (ageDays <= 7) this_week += 1;
    else if (ageDays <= 14) prev_week += 1;
  }
  return {
    total: reports.length,
    open,
    resolved,
    avg_resolution_hours: resolved === 0 ? 0 : Math.round(mttrSum / resolved),
    this_week,
    prev_week,
  };
}

/**
 * Sort teams by descending open queue, tiebreak by total assigned.
 * Empty teams sink to the bottom but remain visible. The roster always
 * shows all 11 divisions so workload imbalance reads at a glance.
 */
export function sortTeamsByLoad(
  workloads: Map<TeamId, TeamWorkload>,
): TeamWorkload[] {
  return Array.from(workloads.values()).sort((a, b) => {
    if (b.openCount !== a.openCount) return b.openCount - a.openCount;
    return b.total - a.total;
  });
}
