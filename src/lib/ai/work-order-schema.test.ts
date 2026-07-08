import { describe, expect, it } from "vitest";
import {
  buildAiWorkOrderSchema,
  buildGeminiWorkOrderSchema,
  GEMINI_WORK_ORDER_SCHEMA,
} from "./work-order-schema";

const VALID_WO = {
  department: "public_works",
  crew_type: "paving",
  est_minutes: 30,
  materials: [{ item: "cold patch", qty: 1 }],
  est_cost: 100,
  rationale: "standard patch",
};

describe("buildGeminiWorkOrderSchema", () => {
  it("with no custom types equals the static schema exactly", () => {
    expect(buildGeminiWorkOrderSchema([])).toEqual(GEMINI_WORK_ORDER_SCHEMA);
  });
  it("appends custom type names to the crew_type enum", () => {
    const s = buildGeminiWorkOrderSchema(["street_lights"]);
    // biome-ignore lint/suspicious/noExplicitAny: test peeks at SDK schema shape
    const enumVals = (s.properties as any).crew_type.enum as string[];
    expect(enumVals).toContain("street_lights");
    expect(enumVals).toContain("paving");
  });
  it("dedupes a custom name that collides with a built-in", () => {
    const s = buildGeminiWorkOrderSchema(["paving"]);
    // biome-ignore lint/suspicious/noExplicitAny: test peeks at SDK schema shape
    const enumVals = (s.properties as any).crew_type.enum as string[];
    expect(enumVals.filter((v) => v === "paving")).toHaveLength(1);
  });
});

describe("buildAiWorkOrderSchema", () => {
  it("accepts built-ins and null with no customs", () => {
    const schema = buildAiWorkOrderSchema([]);
    expect(schema.safeParse(VALID_WO).success).toBe(true);
    expect(schema.safeParse({ ...VALID_WO, crew_type: null }).success).toBe(
      true,
    );
  });
  it("rejects an unknown type with no customs", () => {
    const schema = buildAiWorkOrderSchema([]);
    expect(
      schema.safeParse({ ...VALID_WO, crew_type: "street_lights" }).success,
    ).toBe(false);
  });
  it("accepts a registered custom type", () => {
    const schema = buildAiWorkOrderSchema(["street_lights"]);
    expect(
      schema.safeParse({ ...VALID_WO, crew_type: "street_lights" }).success,
    ).toBe(true);
  });
});
