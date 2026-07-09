import { describe, expect, it } from "vitest";
import {
  buildCorpus,
  corpusStats,
  dedupeCorpus,
  type FeedbackRow,
} from "./feedback-corpus";

const makeRow = (overrides: Partial<FeedbackRow> = {}): FeedbackRow => ({
  id: "fb-1",
  report_id: "r-1",
  original_category: "pothole",
  corrected_category: "sidewalk_damage",
  original_confidence: 0.8,
  created_at: "2026-07-01T10:00:00Z",
  ...overrides,
});

describe("buildCorpus", () => {
  it("produces an example for a corrected row", () => {
    const rows = [makeRow()];
    const corpus = buildCorpus(rows);
    expect(corpus).toHaveLength(1);
    expect(corpus[0].expected).toBe("sidewalk_damage");
    expect(corpus[0].input).toContain("r-1");
    expect(corpus[0].input).toContain("pothole");
    expect(corpus[0].confidence).toBe(0.8);
  });

  it("skips rows where original === corrected", () => {
    const rows = [makeRow({ corrected_category: "pothole" })]; // no change
    expect(buildCorpus(rows)).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(buildCorpus([])).toEqual([]);
  });

  it("handles null confidence", () => {
    const rows = [makeRow({ original_confidence: null })];
    const corpus = buildCorpus(rows);
    expect(corpus[0].confidence).toBeNull();
  });
});

describe("dedupeCorpus", () => {
  it("keeps unique examples unchanged", () => {
    const examples = buildCorpus([
      makeRow({ report_id: "r-1" }),
      makeRow({
        report_id: "r-2",
        original_category: "graffiti",
        corrected_category: "illegal_dump",
      }),
    ]);
    expect(dedupeCorpus(examples)).toHaveLength(2);
  });

  it("keeps the LATER correction when duplicates share report_id+expected", () => {
    const early = buildCorpus([
      makeRow({ id: "fb-1", created_at: "2026-07-01T10:00:00Z" }),
    ])[0];
    const late = buildCorpus([
      makeRow({
        id: "fb-2",
        created_at: "2026-07-02T10:00:00Z",
        original_confidence: 0.5,
      }),
    ])[0];
    const result = dedupeCorpus([early, late]);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.5); // late entry's confidence
  });

  it("handles empty input", () => {
    expect(dedupeCorpus([])).toEqual([]);
  });
});

describe("corpusStats", () => {
  it("returns zero stats for empty corpus", () => {
    const stats = corpusStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avgConfidence).toBeNull();
  });

  it("counts by corrected category", () => {
    const rows = [
      makeRow({ corrected_category: "sidewalk_damage" }),
      makeRow({
        id: "fb-2",
        report_id: "r-2",
        corrected_category: "sidewalk_damage",
      }),
      makeRow({ id: "fb-3", report_id: "r-3", corrected_category: "graffiti" }),
    ];
    const stats = corpusStats(buildCorpus(rows));
    expect(stats.total).toBe(3);
    expect(stats.uniqueCategories).toBe(2);
    expect(stats.byCorrectedCategory.sidewalk_damage).toBe(2);
    expect(stats.byCorrectedCategory.graffiti).toBe(1);
  });

  it("computes average confidence excluding nulls", () => {
    const rows = [
      makeRow({ original_confidence: 0.8 }),
      makeRow({ id: "fb-2", report_id: "r-2", original_confidence: 0.4 }),
      makeRow({ id: "fb-3", report_id: "r-3", original_confidence: null }),
    ];
    const stats = corpusStats(buildCorpus(rows));
    expect(stats.avgConfidence).toBeCloseTo(0.6);
  });

  it("returns null avgConfidence when all confidences are null", () => {
    const rows = [makeRow({ original_confidence: null })];
    expect(corpusStats(buildCorpus(rows)).avgConfidence).toBeNull();
  });
});
