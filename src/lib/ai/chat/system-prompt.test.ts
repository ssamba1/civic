import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("names the role and city and forbids off-topic answers", () => {
    const p = buildSystemPrompt({
      userId: "u1",
      role: "resident",
      citySlug: "cumming",
    });
    expect(p).toMatch(/resident/i);
    expect(p).toMatch(/cumming/i);
    expect(p).toMatch(/civic/i);
    expect(p.toLowerCase()).toContain("do not");
  });
  it("does not claim it can submit or change data", () => {
    const p = buildSystemPrompt({ userId: null, role: "anon", citySlug: null });
    expect(p.toLowerCase()).toMatch(/cannot (submit|change|edit|create)/);
  });
});
