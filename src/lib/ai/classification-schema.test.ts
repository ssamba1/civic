// @vitest-environment node
import { SchemaType } from "@google/generative-ai";
import {
  classificationSchema,
  GEMINI_CLASSIFICATION_SCHEMA,
} from "./classification-schema";

const validInput = {
  category: "pothole",
  subcategory: "deep edge crack",
  severity: 3,
  hazard_radius_m: 1.5,
  visible_size_estimate: "0.5m x 0.5m",
  is_emergency: false,
  confidence: 0.82,
  reasoning: "Visible pavement break with exposed depth.",
} as const;

const PROPERTY_KEYS = [
  "category",
  "subcategory",
  "severity",
  "hazard_radius_m",
  "visible_size_estimate",
  "is_emergency",
  "confidence",
  "reasoning",
] as const;

describe("classificationSchema (zod)", () => {
  it("accepts a fully valid object", () => {
    const result = classificationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validInput);
    }
  });

  it("rejects a category outside the enum", () => {
    const result = classificationSchema.safeParse({
      ...validInput,
      category: "alien_invasion",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["0 (below range)", 0],
    ["6 (above range)", 6],
    ["3.5 (non-integer)", 3.5],
  ])("rejects severity %s", (_label, severity) => {
    const result = classificationSchema.safeParse({ ...validInput, severity });
    expect(result.success).toBe(false);
  });

  it("accepts each in-range integer severity 1..5", () => {
    for (const severity of [1, 2, 3, 4, 5]) {
      const result = classificationSchema.safeParse({
        ...validInput,
        severity,
      });
      expect(result.success).toBe(true);
    }
  });

  it.each([
    ["-0.1 (below 0)", -0.1],
    ["1.1 (above 1)", 1.1],
  ])("rejects confidence %s", (_label, confidence) => {
    const result = classificationSchema.safeParse({
      ...validInput,
      confidence,
    });
    expect(result.success).toBe(false);
  });

  it("accepts confidence at the 0 and 1 boundaries", () => {
    expect(
      classificationSchema.safeParse({ ...validInput, confidence: 0 }).success,
    ).toBe(true);
    expect(
      classificationSchema.safeParse({ ...validInput, confidence: 1 }).success,
    ).toBe(true);
  });

  it("rejects an empty subcategory", () => {
    const result = classificationSchema.safeParse({
      ...validInput,
      subcategory: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty reasoning", () => {
    const result = classificationSchema.safeParse({
      ...validInput,
      reasoning: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative hazard_radius_m", () => {
    const result = classificationSchema.safeParse({
      ...validInput,
      hazard_radius_m: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("GEMINI_CLASSIFICATION_SCHEMA (Gemini responseSchema)", () => {
  it("is an OBJECT type", () => {
    expect(GEMINI_CLASSIFICATION_SCHEMA.type).toBe(SchemaType.OBJECT);
  });

  it("declares all 8 properties matching the zod shape", () => {
    const props = GEMINI_CLASSIFICATION_SCHEMA.properties ?? {};
    const keys = Object.keys(props);
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual([...PROPERTY_KEYS].sort());
  });

  it("lists all 8 properties as required", () => {
    const required = GEMINI_CLASSIFICATION_SCHEMA.required ?? [];
    expect(required).toHaveLength(8);
    expect([...required].sort()).toEqual([...PROPERTY_KEYS].sort());
  });

  it("uses a string enum for category covering every zod category", () => {
    const category = GEMINI_CLASSIFICATION_SCHEMA.properties?.category as
      | { type?: unknown; enum?: string[] }
      | undefined;
    expect(category?.type).toBe(SchemaType.STRING);
    expect(Array.isArray(category?.enum)).toBe(true);
    expect(category?.enum).toContain("pothole");
    expect(category?.enum).toContain("other");
    // Every Gemini enum value must round-trip through the zod enum.
    for (const value of category?.enum ?? []) {
      expect(classificationSchema.shape.category.safeParse(value).success).toBe(
        true,
      );
    }
  });

  it("declares severity as an INTEGER", () => {
    expect(GEMINI_CLASSIFICATION_SCHEMA.properties?.severity?.type).toBe(
      SchemaType.INTEGER,
    );
  });
});
