// src/lib/crew-types.test.ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CREW_TYPES,
  crewTypeLabel,
  descriptionWordCount,
  isBuiltInCrewType,
  MIN_TYPE_DESCRIPTION_WORDS,
  normalizeCrewTypeName,
} from "./crew-types";

describe("BUILT_IN_CREW_TYPES", () => {
  it("contains exactly the 7 AI labor types", () => {
    expect([...BUILT_IN_CREW_TYPES]).toEqual([
      "paving",
      "line_crew",
      "sign_crew",
      "cleanup",
      "concrete",
      "arborist",
      "drain_crew",
    ]);
  });
});

describe("normalizeCrewTypeName", () => {
  it("lowercases, trims, and snake_cases spaces", () => {
    expect(normalizeCrewTypeName("  Street Lights ")).toBe("street_lights");
  });
  it("collapses runs of whitespace/underscores", () => {
    expect(normalizeCrewTypeName("street   __ lights")).toBe("street_lights");
  });
  it("returns null for invalid input", () => {
    expect(normalizeCrewTypeName("")).toBeNull();
    expect(normalizeCrewTypeName("a")).toBeNull(); // too short
    expect(normalizeCrewTypeName("has!bang")).toBeNull(); // bad char
    expect(normalizeCrewTypeName("x".repeat(41))).toBeNull(); // too long
  });
  it("strips leading/trailing underscores and rejects all-underscore", () => {
    expect(normalizeCrewTypeName("_foo_")).toBe("foo");
    expect(normalizeCrewTypeName("___")).toBeNull();
  });
});

describe("isBuiltInCrewType", () => {
  it("recognizes built-ins and rejects customs", () => {
    expect(isBuiltInCrewType("paving")).toBe(true);
    expect(isBuiltInCrewType("street_lights")).toBe(false);
  });
});

describe("descriptionWordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(descriptionWordCount("fixes broken street lights and poles")).toBe(
      6,
    );
    expect(descriptionWordCount("  a  b  ")).toBe(2);
    expect(descriptionWordCount("")).toBe(0);
  });
  it("counts tab/newline separated words", () => {
    expect(descriptionWordCount("a\tb\nc d")).toBe(4);
  });
  it("MIN_TYPE_DESCRIPTION_WORDS is 10", () => {
    expect(MIN_TYPE_DESCRIPTION_WORDS).toBe(10);
  });
});

describe("crewTypeLabel", () => {
  it("renders underscores as spaces", () => {
    expect(crewTypeLabel("line_crew")).toBe("line crew");
    expect(crewTypeLabel("street_lights")).toBe("street lights");
  });
});
