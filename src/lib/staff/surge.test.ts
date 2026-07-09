import { describe, expect, it } from "vitest";
import { reprioritize, type SurgeConfig, type SurgeReport } from "./surge";

const NOW = "2026-07-09T12:00:00.000Z";
const CITY = "city-cumming";

function makeReport(
  overrides: Partial<SurgeReport> & Pick<SurgeReport, "id">,
): SurgeReport {
  return {
    status: "open",
    category: "pothole",
    priority_score: 100,
    city_id: CITY,
    created_at: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

const BASE_SURGE: SurgeConfig = {
  city_id: CITY,
  active: true,
  categories: ["tree_down", "drainage"],
  reason: "Tropical Storm Debby",
  activated_at: NOW,
};

describe("reprioritize", () => {
  it("returns list unchanged when surge is inactive", () => {
    const reports = [
      makeReport({ id: "r1", category: "tree_down", priority_score: 50 }),
    ];
    const result = reprioritize(reports, { ...BASE_SURGE, active: false }, NOW);
    expect(result[0].priority_score).toBe(50);
    expect(result[0].surgeBoost).toBeUndefined();
  });

  it("boosts matching category × 2", () => {
    const r = makeReport({
      id: "r1",
      category: "tree_down",
      priority_score: 80,
    });
    const [boosted] = reprioritize([r], BASE_SURGE, NOW);
    expect(boosted.priority_score).toBe(160);
    expect(boosted.surgeBoost?.original_priority_score).toBe(80);
    expect(boosted.surgeBoost?.boosted_priority_score).toBe(160);
  });

  it("does NOT boost non-matching category", () => {
    const r = makeReport({ id: "r1", category: "pothole", priority_score: 80 });
    const [result] = reprioritize([r], BASE_SURGE, NOW);
    expect(result.priority_score).toBe(80);
    expect(result.surgeBoost).toBeUndefined();
  });

  it("does NOT boost closed/rejected reports", () => {
    const closed = makeReport({
      id: "r1",
      category: "tree_down",
      status: "closed",
    });
    const rejected = makeReport({
      id: "r2",
      category: "drainage",
      status: "rejected",
    });
    const result = reprioritize([closed, rejected], BASE_SURGE, NOW);
    expect(result[0].surgeBoost).toBeUndefined();
    expect(result[1].surgeBoost).toBeUndefined();
  });

  it("boosts open, dispatched, and in_progress reports", () => {
    const reports = [
      makeReport({ id: "r1", category: "tree_down", status: "open" }),
      makeReport({ id: "r2", category: "tree_down", status: "dispatched" }),
      makeReport({ id: "r3", category: "tree_down", status: "in_progress" }),
    ];
    const result = reprioritize(reports, BASE_SURGE, NOW);
    expect(result.every((r) => r.surgeBoost !== undefined)).toBe(true);
  });

  it("does NOT boost reports in a different city", () => {
    const r = makeReport({
      id: "r1",
      category: "tree_down",
      city_id: "city-other",
    });
    const [result] = reprioritize([r], BASE_SURGE, NOW);
    expect(result.surgeBoost).toBeUndefined();
  });

  it("boosts all cities when city_id is null", () => {
    const r = makeReport({
      id: "r1",
      category: "tree_down",
      city_id: "city-other",
    });
    const [result] = reprioritize([r], { ...BASE_SURGE, city_id: null }, NOW);
    expect(result.surgeBoost).toBeDefined();
  });

  it("sorts boosted reports above unboosted", () => {
    const reports = [
      makeReport({
        id: "low-priority-surge",
        category: "tree_down",
        priority_score: 10,
      }),
      makeReport({
        id: "high-priority-no-surge",
        category: "pothole",
        priority_score: 90,
      }),
    ];
    const result = reprioritize(reports, BASE_SURGE, NOW);
    // tree_down (10 × 2 = 20) vs pothole (90 no boost)
    expect(result[0].id).toBe("high-priority-no-surge");
    expect(result[1].id).toBe("low-priority-surge");
  });

  it("sorts boosted items among themselves by priority desc", () => {
    const reports = [
      makeReport({ id: "r1", category: "tree_down", priority_score: 30 }),
      makeReport({ id: "r2", category: "drainage", priority_score: 80 }),
    ];
    const result = reprioritize(reports, BASE_SURGE, NOW);
    // r2: 80×2=160, r1: 30×2=60
    expect(result[0].id).toBe("r2");
    expect(result[1].id).toBe("r1");
  });

  it("uses created_at as tiebreaker (older first) when scores are equal", () => {
    const reports = [
      makeReport({
        id: "newer",
        category: "tree_down",
        priority_score: 50,
        created_at: "2026-07-09T11:00:00.000Z",
      }),
      makeReport({
        id: "older",
        category: "tree_down",
        priority_score: 50,
        created_at: "2026-07-09T09:00:00.000Z",
      }),
    ];
    const result = reprioritize(reports, BASE_SURGE, NOW);
    expect(result[0].id).toBe("older");
  });

  it("no-ops on empty categories list", () => {
    const r = makeReport({
      id: "r1",
      category: "tree_down",
      priority_score: 100,
    });
    const [result] = reprioritize([r], { ...BASE_SURGE, categories: [] }, NOW);
    expect(result.surgeBoost).toBeUndefined();
    expect(result.priority_score).toBe(100);
  });

  it("returns empty array for empty input", () => {
    expect(reprioritize([], BASE_SURGE, NOW)).toEqual([]);
  });
});
