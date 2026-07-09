import { describe, expect, it } from "vitest";
import {
  canMerge,
  categoryScore,
  hammingDistance,
  locationScore,
  type ReportForMerge,
  rankDuplicateCandidates,
  scoreDuplicatePair,
  timeScore,
  visualScore,
} from "./merge";

// ─── hammingDistance ──────────────────────────────────────────────────────────

describe("hammingDistance", () => {
  it("returns 0 for identical hashes", () => {
    expect(hammingDistance("abcdef1234567890", "abcdef1234567890")).toBe(0);
  });

  it("returns correct distance for known pair", () => {
    // 'a' = 1010, 'b' = 1011 → 1 bit different
    expect(hammingDistance("a", "b")).toBe(1);
  });

  it("handles different-length strings gracefully (uses shorter length)", () => {
    expect(hammingDistance("ff", "f")).toBe(0);
  });

  it("handles empty strings", () => {
    expect(hammingDistance("", "abcd")).toBe(0);
  });

  it("returns max distance for fully different hashes", () => {
    // '0' = 0000, 'f' = 1111 → 4 bits each
    const dist = hammingDistance("0000000000000000", "ffffffffffffffff");
    expect(dist).toBe(64);
  });
});

// ─── locationScore ────────────────────────────────────────────────────────────

describe("locationScore", () => {
  it("returns 1 at distance 0", () => {
    expect(locationScore(0)).toBe(1);
  });

  it("returns 0 at distance 500", () => {
    expect(locationScore(500)).toBe(0);
  });

  it("returns 0.5 at distance 250", () => {
    expect(locationScore(250)).toBe(0.5);
  });

  it("clamps to 0 beyond max distance", () => {
    expect(locationScore(1000)).toBe(0);
  });
});

// ─── visualScore ─────────────────────────────────────────────────────────────

describe("visualScore", () => {
  it("returns 0.5 when either hash is null", () => {
    expect(visualScore(null, "abcd")).toBe(0.5);
    expect(visualScore("abcd", null)).toBe(0.5);
    expect(visualScore(null, null)).toBe(0.5);
  });

  it("returns 1 for identical hashes", () => {
    expect(visualScore("abcdef1234567890", "abcdef1234567890")).toBe(1);
  });

  it("returns lower score for different hashes", () => {
    const s = visualScore("0000000000000000", "ffffffffffffffff");
    expect(s).toBe(0);
  });
});

// ─── categoryScore ────────────────────────────────────────────────────────────

describe("categoryScore", () => {
  it("returns 1 for exact match", () => {
    expect(categoryScore("pothole", "pothole")).toBe(1);
  });

  it("returns 0 for mismatch", () => {
    expect(categoryScore("pothole", "graffiti")).toBe(0);
  });

  it("returns 0.5 when either is null", () => {
    expect(categoryScore(null, "pothole")).toBe(0.5);
    expect(categoryScore("pothole", null)).toBe(0.5);
  });
});

// ─── timeScore ────────────────────────────────────────────────────────────────

describe("timeScore", () => {
  it("returns 1 for same timestamp", () => {
    const t = "2026-01-01T00:00:00Z";
    expect(timeScore(t, t)).toBe(1);
  });

  it("returns 0 for dates 90+ days apart", () => {
    const a = "2026-01-01T00:00:00Z";
    const b = "2026-04-02T00:00:00Z"; // 91 days
    expect(timeScore(a, b)).toBe(0);
  });

  it("returns ~0.5 for 45-day gap", () => {
    const a = "2026-01-01T00:00:00Z";
    const b = "2026-02-15T00:00:00Z"; // 45 days
    const s = timeScore(a, b);
    expect(s).toBeCloseTo(0.5, 1);
  });
});

// ─── scoreDuplicatePair ───────────────────────────────────────────────────────

const baseCandidate: ReportForMerge = {
  id: "cand-1",
  city_id: "city-a",
  distance_m: 0,
  photo_phash: "abcdef1234567890",
  category: "pothole",
  address: "123 Main St",
  created_at: "2026-01-01T00:00:00Z",
  merged_into: null,
  status: "open",
};

const baseTarget = {
  photo_phash: "abcdef1234567890",
  category: "pothole",
  created_at: "2026-01-01T00:00:00Z",
};

describe("scoreDuplicatePair", () => {
  it("returns score 1 for a perfect match (same location, hash, category, time)", () => {
    const result = scoreDuplicatePair(baseTarget, baseCandidate);
    expect(result.score).toBe(1);
  });

  it("returns lower score for mismatched category", () => {
    const result = scoreDuplicatePair(
      { ...baseTarget, category: "graffiti" },
      baseCandidate,
    );
    expect(result.score).toBeLessThan(1);
  });

  it("returns score_breakdown with correct keys", () => {
    const result = scoreDuplicatePair(baseTarget, baseCandidate);
    expect(result.score_breakdown).toMatchObject({
      location: expect.any(Number),
      visual: expect.any(Number),
      category: expect.any(Number),
      time: expect.any(Number),
    });
  });

  it("distance reduces location component", () => {
    const far = { ...baseCandidate, distance_m: 500 };
    const near = { ...baseCandidate, distance_m: 0 };
    const farResult = scoreDuplicatePair(baseTarget, far);
    const nearResult = scoreDuplicatePair(baseTarget, near);
    expect(nearResult.score).toBeGreaterThan(farResult.score);
  });
});

// ─── rankDuplicateCandidates ──────────────────────────────────────────────────

describe("rankDuplicateCandidates", () => {
  it("returns candidates sorted by descending score", () => {
    const cands: ReportForMerge[] = [
      { ...baseCandidate, id: "far", distance_m: 400 },
      { ...baseCandidate, id: "near", distance_m: 10 },
      { ...baseCandidate, id: "mid", distance_m: 200 },
    ];
    const ranked = rankDuplicateCandidates(baseTarget, cands);
    expect(ranked[0].id).toBe("near");
    expect(ranked[ranked.length - 1].id).toBe("far");
  });

  it("returns empty array for empty input", () => {
    expect(rankDuplicateCandidates(baseTarget, [])).toEqual([]);
  });
});

// ─── canMerge ─────────────────────────────────────────────────────────────────

const openReport = (id: string, cityId = "city-a") => ({
  id,
  city_id: cityId,
  merged_into: null,
  status: "open",
});

describe("canMerge", () => {
  it("allows merging two distinct open reports in same city", () => {
    const result = canMerge(openReport("a"), openReport("b"));
    expect(result.ok).toBe(true);
  });

  it("rejects merge of a report into itself", () => {
    const result = canMerge(openReport("a"), openReport("a"));
    expect(result).toEqual({ ok: false, error: "cannot_merge_self" });
  });

  it("rejects when merged report is already merged (merged_into set)", () => {
    const result = canMerge(openReport("a"), {
      ...openReport("b"),
      merged_into: "some-canonical",
    });
    expect(result).toEqual({ ok: false, error: "already_merged" });
  });

  it("rejects when merged report has status=merged", () => {
    const result = canMerge(openReport("a"), {
      ...openReport("b"),
      status: "merged",
    });
    expect(result).toEqual({ ok: false, error: "already_merged" });
  });

  it("rejects when canonical is itself merged", () => {
    const result = canMerge(
      { ...openReport("a"), merged_into: "another" },
      openReport("b"),
    );
    expect(result).toEqual({ ok: false, error: "canonical_already_merged" });
  });

  it("rejects when reports are in different cities", () => {
    const result = canMerge(
      openReport("a", "city-x"),
      openReport("b", "city-y"),
    );
    expect(result).toEqual({ ok: false, error: "different_cities" });
  });
});
