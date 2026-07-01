import { describe, expect, it } from "vitest";
import { searchCorpus } from "./retrieval";

describe("searchCorpus", () => {
  it("ranks the privacy doc first for a blur query", () => {
    const results = searchCorpus("how are faces blurred in my photo", 3);
    expect(results[0]?.id).toBe("privacy-blur");
  });
  it("returns at most k results", () => {
    expect(searchCorpus("civic", 2).length).toBeLessThanOrEqual(2);
  });
  it("returns [] for an empty query", () => {
    expect(searchCorpus("   ", 3)).toEqual([]);
  });
});
