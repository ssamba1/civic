import { describe, expect, it, vi } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import { DAY_MS } from "@/lib/utils/time-constants";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/demo-mode", () => ({ DEMO_MODE: true }));
// getCityMorale never calls these, but the module imports them at top level.
vi.mock("@/lib/db/ssr-client", () => ({
  getAuthUser: vi.fn(async () => null),
  createSSRClient: vi.fn(),
}));

const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY_MS).toISOString();

function report(overrides: Partial<DashboardReport>): DashboardReport {
  return {
    id: "r",
    category: "pothole",
    severity: 3,
    status: "closed",
    address: "1 Main St",
    location: { lng: 0, lat: 0 },
    photo_public_url: "p",
    created_at: ago(30),
    reporter_id: "u1",
    ...overrides,
  };
}

// Controlled corpus injected into the morale computation.
const corpus = vi.hoisted(() => ({ reports: [] as DashboardReport[] }));

vi.mock("@/lib/dashboard-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboard-data")>();
  return {
    ...actual,
    getReportCorpus: () => corpus.reports,
    fetchCity: async () => ({ id: "c1" }),
    fetchCityStats: async () => ({
      total: corpus.reports.length,
      open: 0,
      resolved: 0,
      avg_resolution_hours: 40,
      this_week: 0,
      prev_week: 0,
    }),
  };
});

// Analytics fetchers aren't under test — return inert values so morale composes.
vi.mock("@/lib/analytics-data", () => ({
  fetchReportsTrend: async () => [],
  fetchTopNeighborhoods: async () => [],
  fetchResolutionDistribution: async () => [],
  fetchCategoryResolution: async () => [],
}));

import { getCityMorale } from "./resident-data";

describe("getCityMorale — resolvedThisWeek bucketed by resolution time", () => {
  it("counts a report FILED >7d ago but RESOLVED within the last week", async () => {
    // Synthetic resolution time ≈ created + 3.5–7.5d. Filed 10d ago → resolved
    // ≈ 2.5–6.5d ago, i.e. within the week. The old created-time logic
    // (age 10d > 7) would have wrongly excluded it.
    corpus.reports = [
      report({ id: "a", status: "closed", created_at: ago(10) }),
    ];
    const morale = await getCityMorale("cumming");
    expect(morale.resolvedThisWeek).toBe(1);
  });

  it("does NOT count a long-closed report (filed and resolved months ago)", async () => {
    corpus.reports = [
      report({ id: "b", status: "closed", created_at: ago(200) }),
    ];
    const morale = await getCityMorale("cumming");
    expect(morale.resolvedThisWeek).toBe(0);
  });

  it("ignores non-closed reports regardless of age", async () => {
    corpus.reports = [
      report({ id: "c", status: "open", created_at: ago(2) }),
      report({ id: "d", status: "in_progress", created_at: ago(3) }),
    ];
    const morale = await getCityMorale("cumming");
    expect(morale.resolvedThisWeek).toBe(0);
  });

  it("orders topFixedCategories with a stable tie-break on equal counts", async () => {
    // Two categories, one closed report each → equal counts → deterministic
    // alphabetical order (drainage before pothole), not Map-insertion order.
    corpus.reports = [
      report({ id: "e", category: "pothole", created_at: ago(9) }),
      report({ id: "f", category: "drainage", created_at: ago(9) }),
    ];
    const morale = await getCityMorale("cumming");
    expect(morale.topFixedCategories.map((c) => c.category)).toEqual([
      "drainage",
      "pothole",
    ]);
  });
});
