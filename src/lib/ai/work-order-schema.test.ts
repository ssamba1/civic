import { describe, expect, it } from "vitest";
import { DEFAULT_CREW_TYPE_KEYS } from "@/lib/crew-types";
import {
  buildAiWorkOrderSchema,
  buildGeminiWorkOrderSchema,
} from "./work-order-schema";

const VALID_WO = {
  department: "public_works",
  crew_type: "paving",
  est_minutes: 90,
  materials: [{ item: "cold patch", qty: 2 }],
  est_cost: 350,
  rationale: "2-person crew, 1.5h on site.",
};

describe("buildAiWorkOrderSchema", () => {
  it("accepts a crew_type from the provided city keys", () => {
    const schema = buildAiWorkOrderSchema(["night_crew", "paving"]);
    expect(schema.safeParse(VALID_WO).success).toBe(true);
    expect(
      schema.safeParse({ ...VALID_WO, crew_type: "night_crew" }).success,
    ).toBe(true);
  });

  it("rejects a crew_type outside the provided city keys", () => {
    const schema = buildAiWorkOrderSchema(["night_crew"]);
    expect(schema.safeParse(VALID_WO).success).toBe(false);
  });

  it("always accepts null crew_type (category 'other')", () => {
    const schema = buildAiWorkOrderSchema(["night_crew"]);
    expect(schema.safeParse({ ...VALID_WO, crew_type: null }).success).toBe(
      true,
    );
  });

  it("falls back to the default keys when given an empty list", () => {
    const schema = buildAiWorkOrderSchema([]);
    expect(schema.safeParse(VALID_WO).success).toBe(true);
  });
});

describe("buildGeminiWorkOrderSchema", () => {
  it("mirrors the city keys into the crew_type enum", () => {
    const schema = buildGeminiWorkOrderSchema(["night_crew", "paving"]);
    const crewType = schema.properties?.crew_type as { enum?: string[] };
    expect(crewType.enum).toEqual(["night_crew", "paving"]);
  });

  it("never emits an empty enum (Gemini rejects it)", () => {
    const schema = buildGeminiWorkOrderSchema([]);
    const crewType = schema.properties?.crew_type as { enum?: string[] };
    expect(crewType.enum).toEqual(DEFAULT_CREW_TYPE_KEYS);
  });

  it("keeps crew_type out of required so the model can return null", () => {
    const schema = buildGeminiWorkOrderSchema(["paving"]);
    expect(schema.required).not.toContain("crew_type");
  });
});
