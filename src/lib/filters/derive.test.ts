// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import { DAY_MS } from "@/lib/utils/time-constants";
import {
  deriveCategoryResolution,
  deriveHourlyHeatmap,
  deriveKpis,
  deriveReporterVelocity,
  deriveResolutionDistribution,
  deriveSeverityDistribution,
  deriveStatusFunnel,
  deriveTopNeighborhoods,
  deriveTrend,
} from "./derive";

const now = new Date("2026-06-13T12:00:00Z").getTime();

function makeReport(overrides: Partial<DashboardReport> = {}): DashboardReport {
  return {
    id: "r1",
    category: "pothole",
    severity: 3,
    status: "open",
    address: "100 Main St",
    location: { lat: 34.2, lng: -84.1 },
    photo_public_url: "",
    created_at: new Date(now).toISOString(),
    reporter_id: "reporter-1",
    ...overrides,
  };
}

describe("deriveKpis", () => {
  it("calculates resolution_rate = (closed / total) * 100", () => {
    const current = [
      makeReport({ status: "closed" }),
      makeReport({ status: "closed" }),
      makeReport({ status: "open" }),
    ];
    const kpis = deriveKpis(current, []);
    expect(kpis.resolution_rate_pct).toBe(66.7); // (2/3)*100 rounded to 1 decimal
  });

  it("returns 0% resolution_rate for empty corpus", () => {
    const kpis = deriveKpis([], []);
    expect(kpis.resolution_rate_pct).toBe(0);
  });

  it("calculates MTTR as avg(12 + severity*18) for closed reports", () => {
    // sev 1: 30h, sev 5: 102h
    const current = [
      makeReport({ status: "closed", severity: 1 }),
      makeReport({ status: "closed", severity: 5 }),
    ];
    const kpis = deriveKpis(current, []);
    expect(kpis.mttr_hours).toBe(66); // (30+102)/2 = 66
  });

  it("returns 0 MTTR when no closed reports", () => {
    const current = [makeReport({ status: "open" })];
    const kpis = deriveKpis(current, []);
    expect(kpis.mttr_hours).toBe(0);
  });

  it("calculates delta_pct with divide-by-zero guard", () => {
    // resolution_rate_delta_pct is in percentage POINTS (currRate - prevRate).
    // current is 100% resolved, prior window is empty (0%) -> +100 points.
    const current = [makeReport({ status: "closed" })];
    const previous: DashboardReport[] = [];
    const kpis = deriveKpis(current, previous);
    expect(kpis.resolution_rate_delta_pct).toBe(100);
  });

  it("returns 0% delta when both are 0", () => {
    const current: DashboardReport[] = [];
    const previous: DashboardReport[] = [];
    const kpis = deriveKpis(current, previous);
    expect(kpis.resolution_rate_delta_pct).toBe(0);
  });

  it("counts backlog as open+dispatched+in_progress", () => {
    const current = [
      makeReport({ status: "open" }),
      makeReport({ status: "dispatched" }),
      makeReport({ status: "in_progress" }),
      makeReport({ status: "closed" }),
    ];
    const kpis = deriveKpis(current, []);
    expect(kpis.active_backlog).toBe(3);
  });

  it("includes SLA target as constant 90%", () => {
    const kpis = deriveKpis([], []);
    expect(kpis.sla_target_pct).toBe(90);
  });
});

describe("deriveTrend", () => {
  it("creates one point per calendar day from min to max created_at", () => {
    const reports = [
      makeReport({
        id: "r1",
        created_at: new Date(now - 2 * DAY_MS).toISOString(),
      }),
      makeReport({
        id: "r2",
        created_at: new Date(now).toISOString(),
      }),
    ];
    const trend = deriveTrend(reports);
    // 3 days: 2 days ago, 1 day ago, today
    expect(trend.length).toBe(3);
  });

  it("returns empty array for empty corpus", () => {
    const trend = deriveTrend([]);
    expect(trend).toHaveLength(0);
  });

  it("counts created reports per day", () => {
    const reports = [
      makeReport({
        id: "r1",
        created_at: new Date(now - DAY_MS).toISOString(),
      }),
      makeReport({
        id: "r2",
        created_at: new Date(now - DAY_MS).toISOString(),
      }),
      makeReport({
        id: "r3",
        created_at: new Date(now).toISOString(),
      }),
    ];
    const trend = deriveTrend(reports);
    const dayAgo = trend.find(
      (p) => p.date === new Date(now - DAY_MS).toISOString().slice(0, 10),
    );
    const today = trend.find(
      (p) => p.date === new Date(now).toISOString().slice(0, 10),
    );
    expect(dayAgo?.created).toBe(2);
    expect(today?.created).toBe(1);
  });
});

describe("deriveResolutionDistribution", () => {
  it("buckets closed reports by time-to-resolution", () => {
    const reports = [
      makeReport({
        status: "closed",
        severity: 1, // 12 + 1*18 = 30h -> "1-3d" bucket (24h < 30h <= 72h)
      }),
      makeReport({
        status: "closed",
        severity: 5, // 12 + 5*18 = 102h -> "3-7d" bucket (72h < 102h <= 168h)
      }),
    ];
    const dist = deriveResolutionDistribution(reports);
    const oneToThreeDays = dist.find((b) => b.label === "1-3d");
    const threeToSevenDays = dist.find((b) => b.label === "3-7d");
    expect(oneToThreeDays?.count).toBe(1);
    expect(threeToSevenDays?.count).toBe(1);
  });

  it("ignores non-closed status", () => {
    const reports = [
      makeReport({ status: "open", severity: 1 }),
      makeReport({ status: "closed", severity: 1 }),
    ];
    const dist = deriveResolutionDistribution(reports);
    const totalCount = dist.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(1);
  });
});

describe("deriveStatusFunnel", () => {
  it("returns 4 funnel steps in order: open, dispatched, in_progress, closed", () => {
    const reports = [
      makeReport({ status: "open" }),
      makeReport({ status: "open" }),
      makeReport({ status: "dispatched" }),
      makeReport({ status: "closed" }),
    ];
    const funnel = deriveStatusFunnel(reports);
    expect(funnel).toHaveLength(4);
    expect(funnel[0].status).toBe("open");
    expect(funnel[0].count).toBe(2);
    expect(funnel[1].status).toBe("dispatched");
    expect(funnel[1].count).toBe(1);
  });
});

describe("deriveSeverityDistribution", () => {
  it("counts reports per severity 1-5", () => {
    const reports = [
      makeReport({ severity: 1 }),
      makeReport({ severity: 3 }),
      makeReport({ severity: 3 }),
      makeReport({ severity: 5 }),
    ];
    const dist = deriveSeverityDistribution(reports);
    expect(dist).toHaveLength(5);
    expect(dist[0].count).toBe(1); // sev 1
    expect(dist[2].count).toBe(2); // sev 3
    expect(dist[4].count).toBe(1); // sev 5
  });
});

describe("deriveHourlyHeatmap", () => {
  it("creates day×hour grid (7×24 = 168 cells)", () => {
    const heatmap = deriveHourlyHeatmap([]);
    expect(heatmap).toHaveLength(168);
  });

  it("counts reports per day-of-week and hour", () => {
    const d = new Date(now);
    const dayOfWeek = d.getUTCDay();
    const hour = d.getUTCHours();

    const reports = [makeReport({ created_at: d.toISOString() })];
    const heatmap = deriveHourlyHeatmap(reports);
    const cell = heatmap.find((c) => c.day === dayOfWeek && c.hour === hour);
    expect(cell?.count).toBe(1);
  });
});

describe("deriveTopNeighborhoods", () => {
  it("extracts street name from address (tail after house number)", () => {
    const reports = [
      makeReport({ id: "r1", address: "100 Main St" }),
      makeReport({ id: "r2", address: "200 Main St" }),
      makeReport({ id: "r3", address: "300 Oak Ave" }),
    ];
    const neighborhoods = deriveTopNeighborhoods(reports, 5);
    const mainSt = neighborhoods.find((n) => n.name === "Main St");
    expect(mainSt?.count).toBe(2);
  });

  it("counts open (backlog) separately from total count", () => {
    const reports = [
      makeReport({ id: "r1", address: "100 Main St", status: "open" }),
      makeReport({ id: "r2", address: "100 Main St", status: "closed" }),
    ];
    const neighborhoods = deriveTopNeighborhoods(reports, 5);
    const mainSt = neighborhoods[0];
    expect(mainSt.count).toBe(2);
    expect(mainSt.open).toBe(1);
  });

  it("defaults 'Unknown' for missing/empty address", () => {
    const reports = [makeReport({ address: "" })];
    const neighborhoods = deriveTopNeighborhoods(reports, 5);
    expect(neighborhoods.some((n) => n.name === "Unknown")).toBe(true);
  });

  it("limits to N (default 6)", () => {
    const reports = Array.from({ length: 20 }, (_, i) =>
      makeReport({ id: `r${i}`, address: `${100 + i} Street ${i}` }),
    );
    const neighborhoods = deriveTopNeighborhoods(reports);
    expect(neighborhoods).toHaveLength(6);
  });

  it("sorts by count descending", () => {
    const reports = [
      makeReport({ address: "100 Main St" }),
      makeReport({ address: "100 Main St" }),
      makeReport({ address: "200 Oak Ave" }),
    ];
    const neighborhoods = deriveTopNeighborhoods(reports, 5);
    expect(neighborhoods[0].count).toBeGreaterThanOrEqual(
      neighborhoods[1].count,
    );
  });
});

describe("deriveCategoryResolution", () => {
  it("groups by category and calculates avg_hours for closed reports only", () => {
    const reports = [
      makeReport({
        category: "pothole",
        status: "closed",
        severity: 1, // 30h
      }),
      makeReport({
        category: "pothole",
        status: "closed",
        severity: 5, // 102h
      }),
      makeReport({
        category: "pothole",
        status: "open",
      }),
    ];
    const catRes = deriveCategoryResolution(reports);
    const pothole = catRes.find((c) => c.category === "pothole");
    expect(pothole?.avg_hours).toBe(66); // (30+102)/2
    expect(pothole?.count).toBe(3); // all reports, not just closed
  });

  it("includes count (all reports, not just closed)", () => {
    const reports = [
      makeReport({ category: "pothole", status: "closed" }),
      makeReport({ category: "pothole", status: "open" }),
      makeReport({ category: "graffiti", status: "closed" }),
    ];
    const catRes = deriveCategoryResolution(reports);
    const pothole = catRes.find((c) => c.category === "pothole");
    expect(pothole?.count).toBe(2);
  });

  it("sorts by count descending", () => {
    const reports = [
      makeReport({ category: "pothole" }),
      makeReport({ category: "pothole" }),
      makeReport({ category: "graffiti" }),
    ];
    const catRes = deriveCategoryResolution(reports);
    expect(catRes[0].category).toBe("pothole");
  });
});

describe("deriveReporterVelocity", () => {
  it("counts unique reporters (Set size)", () => {
    const reports = [
      makeReport({ reporter_id: "r1" }),
      makeReport({ reporter_id: "r2" }),
      makeReport({ reporter_id: "r1" }),
    ];
    const velocity = deriveReporterVelocity(reports, now);
    expect(velocity.unique_reporters).toBe(2);
  });

  it("calculates reports_per_reporter = count / unique", () => {
    const reports = [
      makeReport({ reporter_id: "r1" }),
      makeReport({ reporter_id: "r1" }),
      makeReport({ reporter_id: "r1" }),
    ];
    const velocity = deriveReporterVelocity(reports, now);
    expect(velocity.reports_per_reporter).toBe(3);
  });

  it("guards against divide-by-zero (unique=0)", () => {
    const velocity = deriveReporterVelocity([], now);
    expect(velocity.reports_per_reporter).toBe(0);
  });

  it("builds spark: 14-day rolling window, reports per day", () => {
    const reports = [
      makeReport({ created_at: new Date(now - 5 * DAY_MS).toISOString() }),
      makeReport({ created_at: new Date(now - 5 * DAY_MS).toISOString() }),
      makeReport({ created_at: new Date(now).toISOString() }),
    ];
    const velocity = deriveReporterVelocity(reports, now);
    expect(velocity.spark).toHaveLength(14);
    expect(velocity.spark.reduce((s, v) => s + v, 0)).toBe(3);
  });
});
