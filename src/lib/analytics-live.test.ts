// @vitest-environment node
// Live-mode (DEMO_MODE=false) coverage for the analytics RPC mappers added in
// migration 036. The demo-mode branches are covered by analytics-data.test.ts;
// this file exercises the real db.rpc() path and its row->shape mapping.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo-mode", () => ({ DEMO_MODE: false }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/dashboard-data", () => ({
  CATEGORY_META: new Proxy(
    {},
    { get: (_t, key) => ({ label: `L:${String(key)}`, color: "#123" }) },
  ),
}));

// rpc responses keyed by function name; each test sets what it needs.
let rpcData: Record<string, { data: unknown; error: unknown }>;
const rpc = vi.fn((fn: string) =>
  Promise.resolve(rpcData[fn] ?? { data: [], error: null }),
);

vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({ rpc }),
}));

import {
  fetchCategoryResolution,
  fetchHourlyHeatmap,
  fetchRecurringHotspots,
  fetchReporterVelocity,
  fetchReportsTrend,
  fetchResolutionDistribution,
  fetchSeverityDistribution,
  fetchStatusFunnel,
  fetchTopNeighborhoods,
} from "./analytics-data";

beforeEach(() => {
  rpcData = {};
  rpc.mockClear();
});

describe("live fetchReportsTrend", () => {
  it("maps rpc rows to TrendPoint and coerces numeric strings", async () => {
    rpcData.analytics_trend = {
      data: [
        { day: "2026-07-01", created: "3", closed: "1" },
        { day: "2026-07-02", created: 5, closed: 2 },
      ],
      error: null,
    };
    const r = await fetchReportsTrend("city1", 2);
    expect(r).toEqual([
      { date: "2026-07-01", created: 3, closed: 1 },
      { date: "2026-07-02", created: 5, closed: 2 },
    ]);
    expect(rpc).toHaveBeenCalledWith("analytics_trend", {
      _city_id: "city1",
      _days: 2,
    });
  });

  it("flatlines to a zero-filled date axis when rpc returns empty", async () => {
    const r = await fetchReportsTrend("city1", 3, Date.parse("2026-07-03Z"));
    expect(r).toHaveLength(3);
    expect(r.every((p) => p.created === 0 && p.closed === 0)).toBe(true);
  });

  it("returns empty (no rpc) when cityId is blank", async () => {
    const r = await fetchReportsTrend("", 3);
    expect(r).toHaveLength(3);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("live fetchStatusFunnel", () => {
  it("fills all four statuses in canonical order, zero for missing", async () => {
    rpcData.analytics_status_funnel = {
      data: [
        { status: "closed", count: 9 },
        { status: "open", count: 2 },
      ],
      error: null,
    };
    const r = await fetchStatusFunnel("c1");
    expect(r.map((s) => s.status)).toEqual([
      "open",
      "dispatched",
      "in_progress",
      "closed",
    ]);
    expect(r.find((s) => s.status === "open")?.count).toBe(2);
    expect(r.find((s) => s.status === "dispatched")?.count).toBe(0);
    expect(r.find((s) => s.status === "closed")?.count).toBe(9);
  });
});

describe("live fetchSeverityDistribution", () => {
  it("returns severities 1-5 with zero fill", async () => {
    rpcData.analytics_severity = {
      data: [
        { severity: 2, count: 4 },
        { severity: 5, count: 1 },
      ],
      error: null,
    };
    const r = await fetchSeverityDistribution("c1");
    expect(r.map((s) => s.severity)).toEqual([1, 2, 3, 4, 5]);
    expect(r[1].count).toBe(4);
    expect(r[4].count).toBe(1);
    expect(r[0].count).toBe(0);
  });
});

describe("live fetchHourlyHeatmap", () => {
  it("always returns a full 7x24 grid, populating provided cells", async () => {
    rpcData.analytics_hourly_heatmap = {
      data: [{ day: 1, hour: 8, count: 7 }],
      error: null,
    };
    const r = await fetchHourlyHeatmap("c1");
    expect(r).toHaveLength(168);
    expect(r.find((c) => c.day === 1 && c.hour === 8)?.count).toBe(7);
    expect(r.find((c) => c.day === 0 && c.hour === 0)?.count).toBe(0);
  });
});

describe("live fetchTopNeighborhoods", () => {
  it("maps rows and coerces counts", async () => {
    rpcData.analytics_top_neighborhoods = {
      data: [{ name: "Main St", count: "5", open: "2" }],
      error: null,
    };
    const r = await fetchTopNeighborhoods("c1");
    expect(r).toEqual([{ name: "Main St", count: 5, open: 2 }]);
  });

  it("returns [] on rpc error (degrade, not throw)", async () => {
    rpcData.analytics_top_neighborhoods = {
      data: null,
      error: { message: "boom" },
    };
    const r = await fetchTopNeighborhoods("c1");
    expect(r).toEqual([]);
  });
});

describe("live fetchCategoryResolution", () => {
  it("enriches with CATEGORY_META label/color", async () => {
    rpcData.analytics_category_resolution = {
      data: [
        { category: "pothole", avg_hours: "58", target_hours: 72, count: 4 },
      ],
      error: null,
    };
    const r = await fetchCategoryResolution("c1");
    expect(r[0]).toMatchObject({
      category: "pothole",
      avg_hours: 58,
      target_hours: 72,
      count: 4,
      label: "L:pothole",
      color: "#123",
    });
  });
});

describe("live fetchReporterVelocity", () => {
  it("derives reports_per_reporter and pulls spark from the trend rpc", async () => {
    rpcData.analytics_reporter_velocity = {
      data: [{ unique_reporters: 10, total: 25 }],
      error: null,
    };
    rpcData.analytics_trend = {
      data: [
        { day: "2026-07-01", created: 4, closed: 1 },
        { day: "2026-07-02", created: 6, closed: 2 },
      ],
      error: null,
    };
    const r = await fetchReporterVelocity("c1");
    expect(r.unique_reporters).toBe(10);
    expect(r.reports_per_reporter).toBe(2.5);
    expect(r.spark).toEqual([4, 6]);
  });

  it("guards divide-by-zero for a city with no reporters", async () => {
    rpcData.analytics_reporter_velocity = {
      data: [{ unique_reporters: 0, total: 0 }],
      error: null,
    };
    const r = await fetchReporterVelocity("c1");
    expect(r.reports_per_reporter).toBe(0);
  });
});

describe("live fetchResolutionDistribution", () => {
  it("maps buckets from rpc", async () => {
    rpcData.analytics_resolution_distribution = {
      data: [{ label: "<24h", hours_max: 24, count: "3" }],
      error: null,
    };
    const r = await fetchResolutionDistribution("c1");
    expect(r[0]).toEqual({ label: "<24h", hours_max: 24, count: 3 });
  });

  it("returns the zero-filled 5-bucket schema when empty", async () => {
    const r = await fetchResolutionDistribution("c1");
    expect(r).toHaveLength(5);
    expect(r.every((b) => b.count === 0)).toBe(true);
  });
});

describe("live fetchRecurringHotspots", () => {
  it("maps rpc rows, coerces numerics, enriches with category meta", async () => {
    rpcData.analytics_recurring_hotspots = {
      data: [
        {
          category: "drainage",
          lng: "-84.14",
          lat: "34.2",
          total: "9",
          open_count: "2",
          episodes: "4",
          first_seen: "2026-02-11",
          last_seen: "2026-07-02",
        },
      ],
      error: null,
    };
    const r = await fetchRecurringHotspots("c1", 3, 2);
    expect(r[0]).toMatchObject({
      category: "drainage",
      lng: -84.14,
      lat: 34.2,
      total: 9,
      episodes: 4,
      label: "L:drainage",
      color: "#123",
    });
    expect(rpc).toHaveBeenCalledWith("analytics_recurring_hotspots", {
      _city_id: "c1",
      _min_count: 3,
      _min_episodes: 2,
    });
  });

  it("returns [] when no location recurs (empty rpc)", async () => {
    const r = await fetchRecurringHotspots("c1");
    expect(r).toEqual([]);
  });
});
