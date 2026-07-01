import { describe, expect, it } from "vitest";
import { HELP_CORPUS } from "./help-corpus";

describe("HELP_CORPUS", () => {
  it("has multiple entries", () => {
    expect(HELP_CORPUS.length).toBeGreaterThanOrEqual(7);
  });
  it("has unique ids and non-empty bodies", () => {
    const ids = new Set(HELP_CORPUS.map((d) => d.id));
    expect(ids.size).toBe(HELP_CORPUS.length);
    for (const d of HELP_CORPUS) {
      expect(d.body.trim().length).toBeGreaterThan(0);
      expect(d.tags.length).toBeGreaterThan(0);
    }
  });
});
