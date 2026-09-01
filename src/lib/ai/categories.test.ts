import { describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORY_KEYS,
  isBuiltinCategory,
  mergeCategoryDefs,
} from "./categories";
import {
  buildClassificationSchema,
  buildGeminiClassificationSchema,
} from "./classification-schema";

describe("mergeCategoryDefs", () => {
  it("keeps the 12 built-ins with 'other' last and no customs", () => {
    const merged = mergeCategoryDefs([]);
    expect(merged.map((c) => c.key)).toEqual(BUILTIN_CATEGORY_KEYS);
    expect(merged.at(-1)?.key).toBe("other");
  });

  it("appends customs before 'other', deduping built-in collisions", () => {
    const merged = mergeCategoryDefs([
      { key: "custom_abandoned_vehicle", description: "A car left unmoved." },
      { key: "pothole", description: "collision. Should be ignored" },
      { key: "custom_abandoned_vehicle", description: "dup, ignored" },
    ]);
    const keys = merged.map((c) => c.key);
    expect(keys).toContain("custom_abandoned_vehicle");
    // built-in collision keeps the built-in def, not the custom text
    expect(merged.find((c) => c.key === "pothole")?.description).not.toBe(
      "collision. Should be ignored",
    );
    // no duplicate custom
    expect(keys.filter((k) => k === "custom_abandoned_vehicle")).toHaveLength(
      1,
    );
    // 'other' stays last
    expect(keys.at(-1)).toBe("other");
  });

  it("skips empty keys", () => {
    const merged = mergeCategoryDefs([{ key: "", description: "x" }]);
    expect(merged.map((c) => c.key)).toEqual(BUILTIN_CATEGORY_KEYS);
  });
});

describe("isBuiltinCategory", () => {
  it("recognizes built-ins and rejects customs", () => {
    expect(isBuiltinCategory("pothole")).toBe(true);
    expect(isBuiltinCategory("custom_abandoned_vehicle")).toBe(false);
  });
});

describe("dynamic classification schema accepts a custom category", () => {
  const keys = [...BUILTIN_CATEGORY_KEYS, "custom_abandoned_vehicle"];
  const base = {
    subcategory: "sedan on flat tires",
    severity: 2 as const,
    hazard_radius_m: 0,
    visible_size_estimate: "one vehicle",
    is_emergency: false,
    confidence: 0.9,
    reasoning: "A car sits unmoved with deflated tires and expired tags.",
    no_issue_detected: false,
    alternate_categories: [],
  };

  it("validates a custom category value the built-in schema would reject", () => {
    const dynamic = buildClassificationSchema(keys);
    expect(
      dynamic.safeParse({ ...base, category: "custom_abandoned_vehicle" })
        .success,
    ).toBe(true);
    // The built-in-only schema rejects it.
    expect(
      buildClassificationSchema(BUILTIN_CATEGORY_KEYS).safeParse({
        ...base,
        category: "custom_abandoned_vehicle",
      }).success,
    ).toBe(false);
  });

  it("still rejects a category outside the offered set", () => {
    const dynamic = buildClassificationSchema(keys);
    expect(
      dynamic.safeParse({ ...base, category: "not_offered" }).success,
    ).toBe(false);
  });

  it("puts the custom key into the Gemini responseSchema enum", () => {
    const schema = buildGeminiClassificationSchema(keys);
    const categoryProp = schema.properties?.category as { enum?: string[] };
    expect(categoryProp.enum).toContain("custom_abandoned_vehicle");
  });
});
