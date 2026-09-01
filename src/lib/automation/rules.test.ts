import { describe, expect, it } from "vitest";
import {
  type AutomationRule,
  type Condition,
  evaluateRules,
  matchesCondition,
  type RuleReport,
  validateRule,
} from "./rules";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
const baseReport: RuleReport = {
  category: "pothole",
  severity: 3,
  is_emergency: false,
  tags: [],
};

function makeRule(
  overrides: Partial<AutomationRule> &
    Pick<AutomationRule, "conditions" | "actions">,
): AutomationRule {
  return {
    id: "test-id",
    city_id: "city-1",
    name: "Test Rule",
    enabled: true,
    priority: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// matchesCondition
// ---------------------------------------------------------------------------
describe("matchesCondition", () => {
  it("eq, matches equal string", () => {
    const c: Condition = { field: "category", op: "eq", value: "pothole" };
    expect(matchesCondition(baseReport, c)).toBe(true);
  });

  it("eq, rejects non-matching string", () => {
    const c: Condition = { field: "category", op: "eq", value: "graffiti" };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("eq, matches boolean", () => {
    const c: Condition = { field: "is_emergency", op: "eq", value: false };
    expect(matchesCondition(baseReport, c)).toBe(true);
  });

  it("gte, matches when field >= value", () => {
    const c: Condition = { field: "severity", op: "gte", value: 3 };
    expect(matchesCondition(baseReport, c)).toBe(true);
  });

  it("gte, rejects when field < value", () => {
    const c: Condition = { field: "severity", op: "gte", value: 4 };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("lte, matches when field <= value", () => {
    const c: Condition = { field: "severity", op: "lte", value: 5 };
    expect(matchesCondition(baseReport, c)).toBe(true);
  });

  it("lte, rejects when field > value", () => {
    const c: Condition = { field: "severity", op: "lte", value: 2 };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("gte, rejects non-numeric value", () => {
    // op gte with string value should return false safely
    const c: Condition = { field: "severity", op: "gte", value: "high" };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("in, matches when field value in array", () => {
    const c: Condition = {
      field: "category",
      op: "in",
      value: ["pothole", "graffiti"],
    };
    expect(matchesCondition(baseReport, c)).toBe(true);
  });

  it("in, rejects when field not in array", () => {
    const c: Condition = {
      field: "category",
      op: "in",
      value: ["graffiti", "water_leak"],
    };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("in, rejects non-array value", () => {
    const c: Condition = { field: "category", op: "in", value: "pothole" };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("contains, matches when tag array contains value", () => {
    const r = { ...baseReport, tags: ["urgent", "reviewed"] };
    const c: Condition = { field: "tag", op: "contains", value: "urgent" };
    expect(matchesCondition(r, c)).toBe(true);
  });

  it("contains, rejects when tag array lacks value", () => {
    const r = { ...baseReport, tags: ["reviewed"] };
    const c: Condition = { field: "tag", op: "contains", value: "urgent" };
    expect(matchesCondition(r, c)).toBe(false);
  });

  it("contains, handles missing tags (undefined)", () => {
    const r: RuleReport = {
      category: "pothole",
      severity: 3,
      is_emergency: false,
    };
    const c: Condition = { field: "tag", op: "contains", value: "urgent" };
    expect(matchesCondition(r, c)).toBe(false);
  });

  it("unknown field returns false", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: Condition = {
      field: "unknown_field" as any,
      op: "eq",
      value: "x",
    };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });

  it("unknown op returns false", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: Condition = {
      field: "category",
      op: "regex" as any,
      value: "pot",
    };
    expect(matchesCondition(baseReport, c)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateRules
// ---------------------------------------------------------------------------
describe("evaluateRules", () => {
  it("returns empty resolved when no rules", () => {
    const result = evaluateRules(baseReport, []);
    expect(result.priority).toBeNull();
    expect(result.assign_team).toBeNull();
    expect(result.auto_acknowledge).toBe(false);
    expect(result.add_tags).toEqual([]);
    expect(result.set_severity).toBeNull();
  });

  it("skips disabled rules", () => {
    const rule = makeRule({
      enabled: false,
      conditions: [],
      actions: [{ type: "set_priority", value: "high" }],
    });
    const result = evaluateRules(baseReport, [rule]);
    expect(result.priority).toBeNull();
  });

  it("applies matching rule actions", () => {
    const rule = makeRule({
      conditions: [{ field: "category", op: "eq", value: "pothole" }],
      actions: [
        { type: "set_priority", value: "high" },
        { type: "assign_team", value: "streets" },
      ],
    });
    const result = evaluateRules(baseReport, [rule]);
    expect(result.priority).toBe("high");
    expect(result.assign_team).toBe("streets");
  });

  it("does not apply when conditions don't match", () => {
    const rule = makeRule({
      conditions: [{ field: "category", op: "eq", value: "graffiti" }],
      actions: [{ type: "set_priority", value: "high" }],
    });
    const result = evaluateRules(baseReport, [rule]);
    expect(result.priority).toBeNull();
  });

  it("first-match-wins on set_priority by priority order", () => {
    const r1 = makeRule({
      priority: 10,
      conditions: [{ field: "category", op: "eq", value: "pothole" }],
      actions: [{ type: "set_priority", value: "low" }],
    });
    const r2 = makeRule({
      priority: 1, // higher precedence (lower number)
      conditions: [{ field: "category", op: "eq", value: "pothole" }],
      actions: [{ type: "set_priority", value: "critical" }],
    });
    const result = evaluateRules(baseReport, [r1, r2]);
    expect(result.priority).toBe("critical"); // r2 has lower priority number → wins
  });

  it("first-match-wins on assign_team", () => {
    const r1 = makeRule({
      priority: 0,
      conditions: [],
      actions: [{ type: "assign_team", value: "streets" }],
    });
    const r2 = makeRule({
      priority: 1,
      conditions: [],
      actions: [{ type: "assign_team", value: "utilities" }],
    });
    const result = evaluateRules(baseReport, [r1, r2]);
    expect(result.assign_team).toBe("streets");
  });

  it("add_tag accumulates across all matching rules (no duplicates)", () => {
    const r1 = makeRule({
      priority: 0,
      conditions: [],
      actions: [{ type: "add_tag", value: "urgent" }],
    });
    const r2 = makeRule({
      priority: 1,
      conditions: [],
      actions: [{ type: "add_tag", value: "reviewed" }],
    });
    const r3 = makeRule({
      priority: 2,
      conditions: [],
      actions: [{ type: "add_tag", value: "urgent" }], // duplicate. Should not double-add
    });
    const result = evaluateRules(baseReport, [r1, r2, r3]);
    expect(result.add_tags).toEqual(["urgent", "reviewed"]);
  });

  it("auto_acknowledge set by any matching rule", () => {
    const r1 = makeRule({
      conditions: [{ field: "category", op: "eq", value: "graffiti" }], // won't match
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    const r2 = makeRule({
      conditions: [{ field: "category", op: "eq", value: "pothole" }], // matches
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    const result = evaluateRules(baseReport, [r1, r2]);
    expect(result.auto_acknowledge).toBe(true);
  });

  it("set_severity first-match-wins", () => {
    const r1 = makeRule({
      priority: 5,
      conditions: [],
      actions: [{ type: "set_severity", value: 2 }],
    });
    const r2 = makeRule({
      priority: 1,
      conditions: [],
      actions: [{ type: "set_severity", value: 5 }],
    });
    const result = evaluateRules(baseReport, [r1, r2]);
    expect(result.set_severity).toBe(5); // r2 wins (priority=1 < 5)
  });

  it("AND logic, all conditions must match", () => {
    const rule = makeRule({
      conditions: [
        { field: "category", op: "eq", value: "pothole" },
        { field: "severity", op: "gte", value: 4 }, // severity=3 → will fail
      ],
      actions: [{ type: "set_priority", value: "high" }],
    });
    const result = evaluateRules(baseReport, [rule]);
    expect(result.priority).toBeNull(); // severity 3 < 4 → no match
  });

  it("AND logic, matches when all conditions pass", () => {
    const rule = makeRule({
      conditions: [
        { field: "category", op: "eq", value: "pothole" },
        { field: "severity", op: "gte", value: 3 },
        { field: "is_emergency", op: "eq", value: false },
      ],
      actions: [{ type: "set_priority", value: "medium" }],
    });
    const result = evaluateRules(baseReport, [rule]);
    expect(result.priority).toBe("medium");
  });

  it("empty conditions array matches all reports", () => {
    const rule = makeRule({
      conditions: [],
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    const result = evaluateRules(baseReport, [rule]);
    expect(result.auto_acknowledge).toBe(true);
  });

  it("conflicting actions: first-match rule wins per action type", () => {
    const r1 = makeRule({
      priority: 0,
      conditions: [{ field: "category", op: "eq", value: "pothole" }],
      actions: [
        { type: "set_priority", value: "high" },
        { type: "assign_team", value: "streets" },
      ],
    });
    const r2 = makeRule({
      priority: 1,
      conditions: [{ field: "severity", op: "gte", value: 1 }],
      actions: [
        { type: "set_priority", value: "low" }, // ignored (already set)
        { type: "set_severity", value: 5 },
      ],
    });
    const result = evaluateRules(baseReport, [r1, r2]);
    expect(result.priority).toBe("high"); // r1 won
    expect(result.assign_team).toBe("streets"); // r1
    expect(result.set_severity).toBe(5); // r2 (first to set it)
  });
});

// ---------------------------------------------------------------------------
// validateRule
// ---------------------------------------------------------------------------
describe("validateRule", () => {
  it("rejects empty name", () => {
    const r = validateRule({
      name: "",
      conditions: [],
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-array conditions", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = validateRule({
      name: "Test",
      conditions: "bad" as any,
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty actions array", () => {
    const r = validateRule({ name: "Test", conditions: [], actions: [] });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch("actions");
  });

  it("rejects invalid condition field", () => {
    const r = validateRule({
      name: "Test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions: [{ field: "bad_field" as any, op: "eq", value: "x" }],
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid action type", () => {
    const r = validateRule({
      name: "Test",
      conditions: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: [{ type: "send_email" as any, value: "foo" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects set_priority with invalid priority", () => {
    const r = validateRule({
      name: "Test",
      conditions: [],
      actions: [{ type: "set_priority", value: "extreme" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects set_severity out of range", () => {
    const r = validateRule({
      name: "Test",
      conditions: [],
      actions: [{ type: "set_severity", value: 6 }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects gte condition with non-numeric value", () => {
    const r = validateRule({
      name: "Test",
      conditions: [{ field: "severity", op: "gte", value: "high" }],
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects in condition with non-array value", () => {
    const r = validateRule({
      name: "Test",
      conditions: [{ field: "category", op: "in", value: "pothole" }],
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a fully valid rule", () => {
    const r = validateRule({
      name: "Pothole high-severity escalate",
      conditions: [
        { field: "category", op: "eq", value: "pothole" },
        { field: "severity", op: "gte", value: 4 },
      ],
      actions: [
        { type: "set_priority", value: "high" },
        { type: "assign_team", value: "streets" },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts auto_acknowledge rule", () => {
    const r = validateRule({
      name: "Auto-ack graffiti",
      conditions: [{ field: "category", op: "eq", value: "graffiti" }],
      actions: [{ type: "auto_acknowledge", value: true }],
    });
    expect(r.ok).toBe(true);
  });
});
