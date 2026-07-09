// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import type { TeamId } from "@/lib/teams";
import {
  aggregateByTeam,
  computeTeamStats,
  sortTeamsByLoad,
  type TeamWorkload,
} from "./teams-data";

// Minimal DashboardReport factory
function makeReport(
  overrides: Partial<DashboardReport> & {
    category: DashboardReport["category"];
  },
): DashboardReport {
  const base: DashboardReport = {
    id: "r1",
    category: overrides.category,
    status: "open",
    severity: 1,
    created_at: new Date(0).toISOString(),
    location: { lat: 34.0, lng: -84.0 },
    photo_public_url: "",
    address: "",
    reporter_id: "user-1",
  };
  return { ...base, ...overrides };
}

const NOW = new Date("2025-01-15T00:00:00Z").getTime();

describe("aggregateByTeam", () => {
  it("returns an entry for every non-all team", () => {
    const workloads = aggregateByTeam([], () => "streets_roads" as TeamId, NOW);
    expect(workloads.has("streets_roads")).toBe(true);
    expect(workloads.has("all")).toBe(false);
  });

  it("increments totals correctly", () => {
    const reports = [
      makeReport({ category: "pothole", status: "open" }),
      makeReport({ category: "pothole", status: "open" }),
    ];
    const workloads = aggregateByTeam(
      reports,
      () => "streets_roads" as TeamId,
      NOW,
    );
    const bucket = workloads.get("streets_roads")!;
    expect(bucket.total).toBe(2);
    expect(bucket.openCount).toBe(2);
    expect(bucket.byStatus.open).toBe(2);
  });

  it("counts backlog statuses in openCount", () => {
    const reports = [
      makeReport({ category: "pothole", status: "open" }),
      makeReport({ category: "pothole", status: "dispatched" }),
      makeReport({ category: "pothole", status: "in_progress" }),
      makeReport({ category: "pothole", status: "closed" }),
    ];
    const workloads = aggregateByTeam(
      reports,
      () => "streets_roads" as TeamId,
      NOW,
    );
    const bucket = workloads.get("streets_roads")!;
    expect(bucket.openCount).toBe(3);
    expect(bucket.closedCount).toBe(1);
  });

  it("computes synthetic MTTR for closed reports", () => {
    // severity 1 → 12 + 1*18 = 30h; severity 3 → 12 + 3*18 = 66h; avg = 48h
    const reports = [
      makeReport({ category: "pothole", status: "closed", severity: 1 }),
      makeReport({ category: "pothole", status: "closed", severity: 3 }),
    ];
    const workloads = aggregateByTeam(
      reports,
      () => "streets_roads" as TeamId,
      NOW,
    );
    expect(workloads.get("streets_roads")!.mttrHours).toBe(48);
  });

  it("sets topCategory to the most common category", () => {
    const getTeam = (r: DashboardReport) =>
      r.category === "pothole"
        ? ("streets_roads" as TeamId)
        : ("parks_forestry" as TeamId);
    const reports = [
      makeReport({ category: "pothole" }),
      makeReport({ category: "pothole" }),
      makeReport({ category: "tree_down" }),
    ];
    const workloads = aggregateByTeam(reports, getTeam, NOW);
    expect(workloads.get("streets_roads")!.topCategory).toBe("pothole");
  });

  it("routes to correct team bucket per getTeam", () => {
    const getTeam = (r: DashboardReport): TeamId =>
      r.category === "pothole" ? "streets_roads" : "parks_forestry";
    const reports = [
      makeReport({ category: "pothole" }),
      makeReport({ category: "tree_down" }),
    ];
    const workloads = aggregateByTeam(reports, getTeam, NOW);
    expect(workloads.get("streets_roads")!.total).toBe(1);
    expect(workloads.get("parks_forestry")!.total).toBe(1);
  });

  it("ignores reports where getTeam returns 'all'", () => {
    const reports = [makeReport({ category: "pothole" })];
    const workloads = aggregateByTeam(reports, () => "all" as TeamId, NOW);
    // all teams initialized to 0 total
    for (const [, bucket] of workloads) {
      expect(bucket.total).toBe(0);
    }
  });

  it("computes oldestOpenAgeDays from created_at", () => {
    const oldDate = new Date(NOW - 10 * 86_400_000).toISOString(); // 10 days ago
    const reports = [
      makeReport({ category: "pothole", status: "open", created_at: oldDate }),
    ];
    const workloads = aggregateByTeam(
      reports,
      () => "streets_roads" as TeamId,
      NOW,
    );
    const age = workloads.get("streets_roads")!.oldestOpenAgeDays!;
    expect(Math.round(age)).toBe(10);
  });
});

describe("computeTeamStats", () => {
  it("counts open, resolved, and weekly buckets", () => {
    const thisWeekDate = new Date(NOW - 3 * 86_400_000).toISOString();
    const prevWeekDate = new Date(NOW - 10 * 86_400_000).toISOString();
    const reports = [
      makeReport({
        category: "pothole",
        status: "open",
        created_at: thisWeekDate,
      }),
      makeReport({
        category: "pothole",
        status: "closed",
        severity: 2,
        created_at: prevWeekDate,
      }),
    ];
    const stats = computeTeamStats(reports, NOW);
    expect(stats.total).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.resolved).toBe(1);
    expect(stats.this_week).toBe(1);
    expect(stats.prev_week).toBe(1);
  });

  it("returns avg_resolution_hours of 0 when no closed reports", () => {
    const reports = [makeReport({ category: "pothole", status: "open" })];
    const stats = computeTeamStats(reports, NOW);
    expect(stats.avg_resolution_hours).toBe(0);
  });

  it("computes avg_resolution_hours correctly", () => {
    // severity 1 → 30h, severity 3 → 66h, avg = 48h
    const reports = [
      makeReport({ category: "pothole", status: "closed", severity: 1 }),
      makeReport({ category: "pothole", status: "closed", severity: 3 }),
    ];
    const stats = computeTeamStats(reports, NOW);
    expect(stats.avg_resolution_hours).toBe(48);
  });

  it("returns zeros for an empty report list", () => {
    const stats = computeTeamStats([], NOW);
    expect(stats).toEqual({
      total: 0,
      open: 0,
      resolved: 0,
      avg_resolution_hours: 0,
      this_week: 0,
      prev_week: 0,
    });
  });
});

describe("sortTeamsByLoad", () => {
  function makeWorkload(
    teamId: TeamId,
    openCount: number,
    total: number,
  ): TeamWorkload {
    return {
      teamId,
      total,
      byStatus: {
        open: openCount,
        dispatched: 0,
        in_progress: 0,
        closed: 0,
        merged: 0,
        rejected: 0,
      },
      openCount,
      closedCount: 0,
      oldestOpenAgeDays: null,
      mttrHours: null,
      topCategory: null,
    };
  }

  it("sorts by descending openCount", () => {
    const map = new Map<TeamId, TeamWorkload>([
      ["streets_roads", makeWorkload("streets_roads", 2, 5)],
      ["parks_forestry", makeWorkload("parks_forestry", 5, 6)],
      ["stormwater", makeWorkload("stormwater", 1, 3)],
    ]);
    const sorted = sortTeamsByLoad(map);
    expect(sorted[0].teamId).toBe("parks_forestry");
    expect(sorted[1].teamId).toBe("streets_roads");
    expect(sorted[2].teamId).toBe("stormwater");
  });

  it("tiebreaks by descending total", () => {
    const map = new Map<TeamId, TeamWorkload>([
      ["streets_roads", makeWorkload("streets_roads", 3, 4)],
      ["parks_forestry", makeWorkload("parks_forestry", 3, 10)],
    ]);
    const sorted = sortTeamsByLoad(map);
    expect(sorted[0].teamId).toBe("parks_forestry");
  });

  it("returns an empty array for an empty map", () => {
    expect(sortTeamsByLoad(new Map())).toEqual([]);
  });
});
