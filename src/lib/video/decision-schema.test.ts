import { describe, expect, it } from "vitest";
import {
  type Decision,
  decisionSchema,
  GEMINI_DECISION_SCHEMA,
  sanitizeDecision,
} from "./decision-schema";

const VALID: Decision = {
  decision: "dispatch",
  category: "pothole",
  severity: 3,
  confidence: 0.8,
  rationale: "Clear deep pothole in the travel lane.",
  merge_report_id: null,
  cost_band: "500_2500",
  citations: [
    { source: "detection_evidence", ref: "cluster-1", note: "frame shows it" },
  ],
};

describe("decisionSchema", () => {
  it("accepts a valid decision", () => {
    expect(decisionSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects unknown decision values and categories", () => {
    expect(
      decisionSchema.safeParse({ ...VALID, decision: "escalate" }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({ ...VALID, category: "sinkhole" }).success,
    ).toBe(false);
  });

  it("rejects out-of-range severity and confidence", () => {
    expect(decisionSchema.safeParse({ ...VALID, severity: 6 }).success).toBe(
      false,
    );
    expect(
      decisionSchema.safeParse({ ...VALID, confidence: 1.5 }).success,
    ).toBe(false);
  });

  it("Gemini schema requires every zod field (contract stays aligned)", () => {
    const zodKeys = Object.keys(decisionSchema.shape).sort();
    expect([...(GEMINI_DECISION_SCHEMA.required ?? [])].sort()).toEqual(
      zodKeys,
    );
  });
});

describe("sanitizeDecision", () => {
  it("keeps a merge whose target was offered", () => {
    const merged = sanitizeDecision(
      { ...VALID, decision: "merge", merge_report_id: "r1" },
      ["r1", "r2"],
    );
    expect(merged.decision).toBe("merge");
    expect(merged.merge_report_id).toBe("r1");
  });

  it("downgrades a merge to monitor when the target was never offered", () => {
    const downgraded = sanitizeDecision(
      { ...VALID, decision: "merge", merge_report_id: "hallucinated" },
      ["r1"],
    );
    expect(downgraded.decision).toBe("monitor");
    expect(downgraded.merge_report_id).toBeNull();
    expect(downgraded.rationale).toContain("downgraded to monitor");
  });

  it("downgrades a merge with a null target", () => {
    const downgraded = sanitizeDecision(
      { ...VALID, decision: "merge", merge_report_id: null },
      ["r1"],
    );
    expect(downgraded.decision).toBe("monitor");
  });

  it("strips a stray merge_report_id from non-merge decisions", () => {
    const cleaned = sanitizeDecision(
      { ...VALID, decision: "dismiss", merge_report_id: "r1" },
      ["r1"],
    );
    expect(cleaned.decision).toBe("dismiss");
    expect(cleaned.merge_report_id).toBeNull();
  });
});
