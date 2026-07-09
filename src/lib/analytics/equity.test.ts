import { describe, expect, it } from "vitest";
import type { DistrictRollup } from "@/lib/db/districts";
import { computeEquity, median } from "./equity";

const makeRollup = (
  overrides: Partial<DistrictRollup> = {},
): DistrictRollup => ({
  districtId: "d1",
  name: "District 1",
  repName: "Rep A",
  total: 10,
  openCount: 2,
  closed: 8,
  avgResolutionHours: 48,
  ...overrides,
});

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });
  it("returns the single value", () => {
    expect(median([42])).toBe(42);
  });
  it("returns middle value for odd count", () => {
    expect(median([10, 20, 30])).toBe(20);
  });
  it("averages two middle values for even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it("handles unsorted input", () => {
    expect(median([30, 10, 20])).toBe(20);
  });
});

describe("computeEquity", () => {
  it("returns empty array for empty input", () => {
    expect(computeEquity([], 0)).toEqual([]);
  });

  it("maps district fields correctly", () => {
    const row = makeRollup({
      districtId: "d1",
      name: "North",
      repName: "Alice",
      total: 10,
      openCount: 3,
      closed: 7,
      avgResolutionHours: 48,
    });
    const [r] = computeEquity([row], 40);
    expect(r.districtId).toBe("d1");
    expect(r.name).toBe("North");
    expect(r.repName).toBe("Alice");
    expect(r.reportCount).toBe(10);
    expect(r.avgResolutionHours).toBe(48);
    expect(r.openRate).toBeCloseTo(0.3);
  });

  it("flags underserved when avg resolution > 1.5x median", () => {
    const fast = makeRollup({ districtId: "d1", avgResolutionHours: 40 });
    const slow = makeRollup({ districtId: "d2", avgResolutionHours: 100 });
    // median = 40, threshold = 60
    const rows = computeEquity([fast, slow], 40);
    expect(rows.find((r) => r.districtId === "d1")?.underserved).toBe(false);
    expect(rows.find((r) => r.districtId === "d2")?.underserved).toBe(true);
  });

  it("never flags underserved when median is 0", () => {
    const row = makeRollup({ avgResolutionHours: 999 });
    const [r] = computeEquity([row], 0);
    expect(r.underserved).toBe(false);
  });

  it("openRate is 0 when total is 0", () => {
    const row = makeRollup({ total: 0, openCount: 0 });
    const [r] = computeEquity([row], 50);
    expect(r.openRate).toBe(0);
  });
});
