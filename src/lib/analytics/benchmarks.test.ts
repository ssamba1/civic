import { describe, expect, it } from "vitest";
import type { PeerBenchmarkRow } from "./benchmarks";
import { rankCities } from "./benchmarks";

const row = (overrides: Partial<PeerBenchmarkRow> = {}): PeerBenchmarkRow => ({
  cityId: "c1",
  cityName: "Test City",
  state: "GA",
  totalReports: 100,
  avgResolutionHours: 48,
  closeRate: 0.8,
  reportsPerCapita: null,
  ...overrides,
});

describe("rankCities", () => {
  it("returns empty array for empty input", () => {
    expect(rankCities([], "avgResolutionHours")).toEqual([]);
  });

  it("ranks by avgResolutionHours ascending (lower = better rank)", () => {
    const rows = [
      row({ cityId: "a", avgResolutionHours: 72 }),
      row({ cityId: "b", avgResolutionHours: 24 }),
      row({ cityId: "c", avgResolutionHours: 48 }),
    ];
    const ranked = rankCities(rows, "avgResolutionHours");
    expect(ranked.find((r) => r.cityId === "b")?.rank).toBe(1);
    expect(ranked.find((r) => r.cityId === "c")?.rank).toBe(2);
    expect(ranked.find((r) => r.cityId === "a")?.rank).toBe(3);
  });

  it("ranks by closeRate descending (higher = better rank)", () => {
    const rows = [
      row({ cityId: "a", closeRate: 0.7 }),
      row({ cityId: "b", closeRate: 0.9 }),
    ];
    const ranked = rankCities(rows, "closeRate");
    expect(ranked.find((r) => r.cityId === "b")?.rank).toBe(1);
    expect(ranked.find((r) => r.cityId === "a")?.rank).toBe(2);
  });

  it("assigns same rank to tied values", () => {
    const rows = [
      row({ cityId: "a", avgResolutionHours: 48 }),
      row({ cityId: "b", avgResolutionHours: 48 }),
      row({ cityId: "c", avgResolutionHours: 96 }),
    ];
    const ranked = rankCities(rows, "avgResolutionHours");
    expect(ranked.find((r) => r.cityId === "a")?.rank).toBe(1);
    expect(ranked.find((r) => r.cityId === "b")?.rank).toBe(1);
    expect(ranked.find((r) => r.cityId === "c")?.rank).toBe(3);
  });

  it("treats null reportsPerCapita as 0 when ranking", () => {
    const rows = [
      row({ cityId: "a", reportsPerCapita: null }),
      row({ cityId: "b", reportsPerCapita: 5 }),
    ];
    const ranked = rankCities(rows, "reportsPerCapita");
    expect(ranked.find((r) => r.cityId === "b")?.rank).toBe(1);
    expect(ranked.find((r) => r.cityId === "a")?.rank).toBe(2);
  });
});
