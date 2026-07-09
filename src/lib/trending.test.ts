import { describe, expect, it } from "vitest";
import { rankTrending, scoreTrending } from "./trending";

const NOW = new Date("2024-06-01T12:00:00Z");
const NOW_MS = NOW.getTime();
const HOUR_MS = 60 * 60 * 1000;

function makeReport(
  id: string,
  upvotes: number,
  ageHours: number,
): { id: string; created_at: string; upvotes: number } {
  return {
    id,
    upvotes,
    created_at: new Date(NOW_MS - ageHours * HOUR_MS).toISOString(),
  };
}

describe("scoreTrending", () => {
  it("returns 0 for 0 upvotes regardless of age", () => {
    const r = makeReport("a", 0, 10);
    expect(scoreTrending(r, NOW)).toBe(0);
  });

  it("score decreases as the report ages", () => {
    const fresh = makeReport("f", 10, 1);
    const old = makeReport("o", 10, 200);
    expect(scoreTrending(fresh, NOW)).toBeGreaterThan(scoreTrending(old, NOW));
  });

  it("score is at most upvotes (when age = 0)", () => {
    const r = makeReport("x", 5, 0);
    expect(scoreTrending(r, NOW)).toBeCloseTo(5, 4);
  });

  it("score ~= upvotes * e^-1 at the half-life (72 h)", () => {
    // The implementation uses exponential decay: score = upvotes × e^(-t/half_life).
    // At t = half_life: e^(-1) ≈ 0.3679.
    const r = makeReport("hl", 100, 72);
    const score = scoreTrending(r, NOW);
    expect(score).toBeGreaterThan(35);
    expect(score).toBeLessThan(40);
  });

  it("accepts a numeric timestamp for now", () => {
    const r = makeReport("n", 8, 0);
    expect(scoreTrending(r, NOW_MS)).toBeCloseTo(8, 4);
  });
});

describe("rankTrending", () => {
  it("returns empty array for empty input", () => {
    expect(rankTrending([], NOW)).toEqual([]);
  });

  it("ranks higher-upvote fresh reports first", () => {
    const a = makeReport("a", 50, 1); // 50 votes, 1 h old
    const b = makeReport("b", 5, 1); // 5 votes, 1 h old
    const ranked = rankTrending([b, a], NOW);
    expect(ranked[0].id).toBe("a");
    expect(ranked[1].id).toBe("b");
  });

  it("breaks ties by recency", () => {
    // Same upvotes, same score — newer wins
    const older = makeReport("old", 10, 48);
    const newer = makeReport("new", 10, 1);
    // newer decays less → higher score → should come first
    const ranked = rankTrending([older, newer], NOW);
    expect(ranked[0].id).toBe("new");
  });

  it("does not mutate the input array", () => {
    const reports = [makeReport("a", 1, 10), makeReport("b", 100, 5)];
    const copy = [...reports];
    rankTrending(reports, NOW);
    expect(reports).toEqual(copy);
  });

  it("preserves extra fields on reports", () => {
    const r = {
      id: "x",
      created_at: NOW.toISOString(),
      upvotes: 3,
      extra: "yes",
    };
    const [result] = rankTrending([r], NOW);
    expect(result.extra).toBe("yes");
  });
});
