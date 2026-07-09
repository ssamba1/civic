import { describe, expect, it } from "vitest";
import { normalizeSeverity, severityToPriority } from "./hazard-grade";

describe("normalizeSeverity", () => {
  it("returns exact matches", () => {
    expect(normalizeSeverity("low")).toBe("low");
    expect(normalizeSeverity("medium")).toBe("medium");
    expect(normalizeSeverity("high")).toBe("high");
    expect(normalizeSeverity("critical")).toBe("critical");
  });

  it("is case-insensitive", () => {
    expect(normalizeSeverity("LOW")).toBe("low");
    expect(normalizeSeverity("CRITICAL")).toBe("critical");
    expect(normalizeSeverity("High")).toBe("high");
  });

  it("accepts partial prefix matches", () => {
    expect(normalizeSeverity("critical - immediate hazard")).toBe("critical");
    expect(normalizeSeverity("high risk")).toBe("high");
    expect(normalizeSeverity("medium severity")).toBe("medium");
  });

  it("defaults to medium for unknown values", () => {
    expect(normalizeSeverity("unknown")).toBe("medium");
    expect(normalizeSeverity("")).toBe("medium");
    expect(normalizeSeverity("severe")).toBe("medium");
  });
});

describe("severityToPriority", () => {
  it("maps each severity to the expected delta", () => {
    expect(severityToPriority("low")).toBe(0);
    expect(severityToPriority("medium")).toBe(5);
    expect(severityToPriority("high")).toBe(15);
    expect(severityToPriority("critical")).toBe(30);
  });

  it("produces monotonically increasing values", () => {
    const order = ["low", "medium", "high", "critical"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(severityToPriority(order[i])).toBeGreaterThan(
        severityToPriority(order[i - 1]),
      );
    }
  });
});
