// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock demo-mode: default ON (tests can override per test)
vi.mock("@/lib/demo-mode", () => ({ DEMO_MODE: true }));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// Mock CATEGORY_META used by fetchCategoryResolution
vi.mock("@/lib/dashboard-data", () => ({
  CATEGORY_META: new Proxy(
    {},
    {
      get: (_t, key) => ({ label: String(key), color: "#000" }),
    },
  ),
}));

// Per-table awaitable chainable builder
let countResponses: Record<string, { count: number | null; error: unknown }>;

function makeCountBuilder(defaultCount: number | null = 0) {
  const b: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "not",
    "in",
    "gt",
    "lte",
    "order",
    "limit",
  ]) {
    b[m] = () => b;
  }
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve({ count: defaultCount, error: null });
  return b;
}

const from = vi.fn(() => makeCountBuilder(10));
vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({ from }),
}));

import {
  fetchAnalyticsKpis,
  fetchCategoryResolution,
  fetchHourlyHeatmap,
  fetchReporterVelocity,
  fetchReportsTrend,
  fetchResolutionDistribution,
  fetchSeverityDistribution,
  fetchStatusFunnel,
  fetchTopNeighborhoods,
} from "./analytics-data";

beforeEach(() => {
  countResponses = {};
  from.mockClear();
});

describe("fetchAnalyticsKpis", () => {
  it("returns KPI_FALLBACK when cityId is empty", async () => {
    const r = await fetchAnalyticsKpis("");
    expect(r.resolution_rate_pct).toBe(76.5); // KPI_FALLBACK demo value
  });

  it("returns KPI_FALLBACK when total reports = 0", async () => {
    // Override from to return count 0
    from.mockReturnValue(makeCountBuilder(0));
    const r = await fetchAnalyticsKpis("city1");
    expect(r.resolution_rate_pct).toBe(76.5);
  });

  it("computes resolution_rate_pct from live counts", async () => {
    // Sequence: total=100, closed=80, backlog=20, twTotal=40, twClosed=32, pwTotal=30, pwClosed=24
    const counts = [100, 80, 20, 40, 32, 30, 24];
    let callIndex = 0;
    from.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      const captured = callIndex++;
      for (const m of [
        "select",
        "eq",
        "not",
        "in",
        "gt",
        "lte",
        "order",
        "limit",
      ]) {
        b[m] = () => b;
      }
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ count: counts[captured] ?? 0, error: null });
      return b;
    });

    const r = await fetchAnalyticsKpis("city1");
    // 80/100 = 80%
    expect(r.resolution_rate_pct).toBe(80);
    // active_backlog from backlogR.count = 20
    expect(r.active_backlog).toBe(20);
  });

  it("returns KPI_FALLBACK on DB error", async () => {
    from.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      for (const m of [
        "select",
        "eq",
        "not",
        "in",
        "gt",
        "lte",
        "order",
        "limit",
      ]) {
        b[m] = () => b;
      }
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ count: null, error: { message: "db error" } });
      return b;
    });
    const r = await fetchAnalyticsKpis("city1");
    expect(r.resolution_rate_pct).toBe(76.5);
  });
});

describe("fetchReportsTrend", () => {
  it("returns `days` entries in ascending date order", async () => {
    const now = new Date("2026-06-01T00:00:00Z").getTime();
    const result = await fetchReportsTrend("c1", 7, now);
    expect(result).toHaveLength(7);
    expect(result[0].date).toBe("2026-05-26");
    expect(result[6].date).toBe("2026-06-01");
  });

  it("in demo mode returns non-zero values", async () => {
    const now = new Date("2026-06-01T00:00:00Z").getTime();
    const result = await fetchReportsTrend("c1", 7, now);
    const hasNonZero = result.some((p) => p.created > 0 || p.closed > 0);
    expect(hasNonZero).toBe(true);
  });

  it("is deterministic (same now → same values)", async () => {
    const now = 1750000000000;
    const a = await fetchReportsTrend("c1", 14, now);
    const b = await fetchReportsTrend("c1", 14, now);
    expect(a).toEqual(b);
  });
});

describe("fetchResolutionDistribution", () => {
  it("returns 5 buckets in demo mode", async () => {
    const r = await fetchResolutionDistribution("c1");
    expect(r).toHaveLength(5);
    expect(r[0].label).toBe("<24h");
    expect(r[0].count).toBeGreaterThan(0);
  });
});

describe("fetchStatusFunnel", () => {
  it("returns 4 steps with demo counts", async () => {
    const r = await fetchStatusFunnel("c1");
    expect(r).toHaveLength(4);
    const statuses = r.map((s) => s.status);
    expect(statuses).toContain("open");
    expect(statuses).toContain("closed");
    // demo mode values
    const openStep = r.find((s) => s.status === "open");
    expect(openStep?.count).toBeGreaterThan(0);
  });
});

describe("fetchSeverityDistribution", () => {
  it("returns 5 slices covering severities 1-5", async () => {
    const r = await fetchSeverityDistribution("c1");
    expect(r.map((s) => s.severity)).toEqual([1, 2, 3, 4, 5]);
    expect(r[0].count).toBeGreaterThan(0); // demo mode
  });
});

describe("fetchHourlyHeatmap", () => {
  it("returns 168 cells (7 days * 24 hours)", async () => {
    const r = await fetchHourlyHeatmap("c1");
    expect(r).toHaveLength(168);
  });

  it("day values are 0-6, hour values are 0-23", async () => {
    const r = await fetchHourlyHeatmap("c1");
    const days = new Set(r.map((c) => c.day));
    const hours = new Set(r.map((c) => c.hour));
    expect(days.size).toBe(7);
    expect(hours.size).toBe(24);
  });

  it("commute hours have higher average count than off-peak in demo mode", async () => {
    const r = await fetchHourlyHeatmap("c1");
    const commute = r.filter(
      (c) =>
        c.day >= 1 &&
        c.day <= 5 &&
        ((c.hour >= 7 && c.hour <= 9) || (c.hour >= 16 && c.hour <= 19)),
    );
    const offpeak = r.filter(
      (c) =>
        c.day >= 1 &&
        c.day <= 5 &&
        !(c.hour >= 7 && c.hour <= 9) &&
        !(c.hour >= 16 && c.hour <= 19) &&
        c.hour < 22 &&
        c.hour > 6,
    );
    const avg = (cells: typeof r) =>
      cells.reduce((s, c) => s + c.count, 0) / cells.length;
    expect(avg(commute)).toBeGreaterThan(avg(offpeak));
  });
});

describe("fetchTopNeighborhoods", () => {
  it("returns neighborhoods in demo mode", async () => {
    const r = await fetchTopNeighborhoods("c1");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]).toHaveProperty("name");
    expect(r[0]).toHaveProperty("count");
    expect(r[0]).toHaveProperty("open");
  });
});

describe("fetchCategoryResolution", () => {
  it("returns rows enriched with label and color from CATEGORY_META", async () => {
    const r = await fetchCategoryResolution("c1");
    expect(r.length).toBeGreaterThan(0);
    for (const row of r) {
      expect(typeof row.label).toBe("string");
      expect(typeof row.color).toBe("string");
      expect(row.avg_hours).toBeGreaterThan(0);
    }
  });
});

describe("fetchReporterVelocity", () => {
  it("returns 14-element spark array in demo mode", async () => {
    const r = await fetchReporterVelocity("c1");
    expect(r.spark).toHaveLength(14);
    expect(r.unique_reporters).toBe(134);
    expect(r.reports_per_reporter).toBeCloseTo(1.84, 1);
  });
});
