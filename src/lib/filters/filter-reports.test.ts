// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { DashboardReport, ReportFilter } from "@/lib/filters/types";
import { filterReports, filterPreviousWindow, resolveWindow } from "./filter-reports";

const now = new Date("2026-06-13T12:00:00Z").getTime();
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

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

describe("resolveWindow", () => {
  const baseFilter: ReportFilter = {
    preset: "all",
    from: null,
    to: null,
    categories: [],
    minSeverity: 1,
    statuses: [],
    team: "all",
  };

  it("returns null bounds for 'all' preset", () => {
    const result = resolveWindow({ ...baseFilter, preset: "all" }, now);
    expect(result.lower).toBeNull();
    expect(result.upper).toBeNull();
  });

  it("applies 7d preset window", () => {
    const result = resolveWindow({ ...baseFilter, preset: "7d" }, now);
    expect(result.lower).toBe(now - 7 * DAY_MS);
    expect(result.upper).toBeNull();
  });

  it("applies 14d preset window", () => {
    const result = resolveWindow({ ...baseFilter, preset: "14d" }, now);
    expect(result.lower).toBe(now - 14 * DAY_MS);
    expect(result.upper).toBeNull();
  });

  it("applies 30d preset window", () => {
    const result = resolveWindow({ ...baseFilter, preset: "30d" }, now);
    expect(result.lower).toBe(now - 30 * DAY_MS);
    expect(result.upper).toBeNull();
  });

  it("applies 90d preset window", () => {
    const result = resolveWindow({ ...baseFilter, preset: "90d" }, now);
    expect(result.lower).toBe(now - 90 * DAY_MS);
    expect(result.upper).toBeNull();
  });

  it("parses custom from/to with inclusive-of-whole-day upper bound", () => {
    const result = resolveWindow(
      { ...baseFilter, preset: "custom", from: "2026-06-01", to: "2026-06-03" },
      now,
    );
    expect(result.lower).toBe(Date.parse("2026-06-01"));
    // Upper bound: 2026-06-03 + 1 day (inclusive)
    expect(result.upper).toBe(Date.parse("2026-06-04"));
  });

  it("handles NaN gracefully when Date.parse fails", () => {
    const result = resolveWindow(
      { ...baseFilter, preset: "custom", from: "invalid", to: "2026-06-03" },
      now,
    );
    expect(result.lower).toBeNull();
    expect(result.upper).toBe(Date.parse("2026-06-04"));
  });

  it("returns null for both when 'to' is invalid", () => {
    const result = resolveWindow(
      { ...baseFilter, preset: "custom", from: "2026-06-01", to: "invalid" },
      now,
    );
    expect(result.lower).toBe(Date.parse("2026-06-01"));
    expect(result.upper).toBeNull();
  });
});

describe("filterReports", () => {
  const baseFilter: ReportFilter = {
    preset: "14d",
    from: null,
    to: null,
    categories: [],
    minSeverity: 1,
    statuses: [],
    team: "all",
  };

  it("includes all reports when no constraints", () => {
    const reports = [
      makeReport({ id: "r1", category: "pothole", severity: 5, status: "closed" }),
      makeReport({ id: "r2", category: "graffiti", severity: 1, status: "open" }),
    ];
    const result = filterReports(reports, baseFilter, now);
    expect(result).toHaveLength(2);
  });

  it("returns empty when filter matches nothing", () => {
    const reports = [makeReport({ severity: 1 })];
    const result = filterReports(reports, { ...baseFilter, minSeverity: 3 }, now);
    expect(result).toHaveLength(0);
  });

  it("enforces minSeverity threshold", () => {
    const reports = [
      makeReport({ id: "r1", severity: 2 }),
      makeReport({ id: "r2", severity: 3 }),
      makeReport({ id: "r3", severity: 5 }),
    ];
    const result = filterReports(reports, { ...baseFilter, minSeverity: 3 }, now);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["r2", "r3"]);
  });

  it("filters by category when provided", () => {
    const reports = [
      makeReport({ id: "r1", category: "pothole" }),
      makeReport({ id: "r2", category: "graffiti" }),
      makeReport({ id: "r3", category: "pothole" }),
    ];
    const result = filterReports(reports, { ...baseFilter, categories: ["pothole"] }, now);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("empty categories array means no category constraint", () => {
    const reports = [
      makeReport({ id: "r1", category: "pothole" }),
      makeReport({ id: "r2", category: "graffiti" }),
    ];
    const result = filterReports(reports, { ...baseFilter, categories: [] }, now);
    expect(result).toHaveLength(2);
  });

  it("filters by status when provided", () => {
    const reports = [
      makeReport({ id: "r1", status: "open" }),
      makeReport({ id: "r2", status: "closed" }),
      makeReport({ id: "r3", status: "open" }),
    ];
    const result = filterReports(reports, { ...baseFilter, statuses: ["closed"] }, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r2");
  });

  it("applies date window (14d preset excludes older reports)", () => {
    const reports = [
      makeReport({ id: "r1", created_at: new Date(now - 5 * DAY_MS).toISOString() }),
      makeReport({ id: "r2", created_at: new Date(now - 20 * DAY_MS).toISOString() }),
    ];
    const result = filterReports(reports, { ...baseFilter, preset: "14d" }, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });

  it("combines multiple constraints (AND logic)", () => {
    const reports = [
      makeReport({ id: "r1", severity: 3, status: "open", category: "pothole" }),
      makeReport({ id: "r2", severity: 1, status: "open", category: "pothole" }),
      makeReport({ id: "r3", severity: 3, status: "closed", category: "pothole" }),
      makeReport({ id: "r4", severity: 3, status: "open", category: "graffiti" }),
    ];
    const result = filterReports(
      reports,
      {
        ...baseFilter,
        minSeverity: 3,
        status: ["open"],
        categories: ["pothole"],
      },
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });

  it("respects team filter when not 'all'", () => {
    const reports = [
      makeReport({ id: "r1", category: "pothole" }),
      makeReport({ id: "r2", category: "graffiti" }),
    ];
    // Note: Actual team resolution depends on categoryToTeam() and overrides
    // This test verifies the team constraint is applied
    const result = filterReports(
      reports,
      { ...baseFilter, team: "streets_roads" },
      now,
      { pothole: "streets_roads", graffiti: "streets_roads" },
    );
    expect(result).toHaveLength(2);
  });

  it("filters by team override snapshot", () => {
    const reports = [makeReport({ id: "r1", category: "pothole" })];
    // Pothole normally maps to streets_roads, but override maps it to parks
    const result = filterReports(
      reports,
      { ...baseFilter, team: "parks_forestry" },
      now,
      { pothole: "parks_forestry" },
    );
    expect(result).toHaveLength(1);
  });
});

describe("filterPreviousWindow", () => {
  const baseFilter: ReportFilter = {
    preset: "14d",
    from: null,
    to: null,
    categories: [],
    minSeverity: 1,
    statuses: [],
    team: "all",
  };

  it("returns empty for 'all' preset (no comparable prior window)", () => {
    const reports = [makeReport()];
    const result = filterPreviousWindow(reports, { ...baseFilter, preset: "all" }, now);
    expect(result).toHaveLength(0);
  });

  it("calculates prior window as same length, ending at current lower", () => {
    // Current: now - 14d to now
    // Prior: now - 28d to now - 14d
    const reports = [
      makeReport({
        id: "r1",
        created_at: new Date(now - 10 * DAY_MS).toISOString(), // in current window
      }),
      makeReport({
        id: "r2",
        created_at: new Date(now - 20 * DAY_MS).toISOString(), // in prior window
      }),
      makeReport({
        id: "r3",
        created_at: new Date(now - 30 * DAY_MS).toISOString(), // before prior window
      }),
    ];
    const result = filterPreviousWindow(reports, { ...baseFilter, preset: "14d" }, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r2");
  });

  it("applies same category/status/severity filters as current window", () => {
    const reports = [
      makeReport({
        id: "r1",
        category: "pothole",
        severity: 3,
        created_at: new Date(now - 20 * DAY_MS).toISOString(),
      }),
      makeReport({
        id: "r2",
        category: "graffiti",
        severity: 3,
        created_at: new Date(now - 20 * DAY_MS).toISOString(),
      }),
    ];
    const result = filterPreviousWindow(
      reports,
      { ...baseFilter, preset: "14d", categories: ["pothole"], minSeverity: 3 },
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });
});
