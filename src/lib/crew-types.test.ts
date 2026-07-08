// src/lib/crew-types.test.ts
import { describe, expect, it } from "vitest";
import {
  type CrewTypeDef,
  crewTypeLabel,
  DEFAULT_CREW_TYPES,
  descriptionWordCount,
  MIN_TYPE_DESCRIPTION_WORDS,
  normalizeCrewTypeKey,
} from "./crew-types";

describe("DEFAULT_CREW_TYPES", () => {
  it("seeds exactly the 7 AI labor types", () => {
    expect(DEFAULT_CREW_TYPES.map((t) => t.key)).toEqual([
      "paving",
      "line_crew",
      "sign_crew",
      "cleanup",
      "concrete",
      "arborist",
      "drain_crew",
    ]);
  });
  it("every seed has a non-empty label and description", () => {
    for (const t of DEFAULT_CREW_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeCrewTypeKey", () => {
  it("lowercases, trims, and snake_cases spaces", () => {
    expect(normalizeCrewTypeKey("  Street Lights ")).toBe("street_lights");
  });
  it("collapses runs of whitespace/underscores", () => {
    expect(normalizeCrewTypeKey("street   __ lights")).toBe("street_lights");
  });
  it("strips leading/trailing underscores", () => {
    expect(normalizeCrewTypeKey("_foo_")).toBe("foo");
  });
  it("returns null for invalid input", () => {
    expect(normalizeCrewTypeKey("")).toBeNull();
    expect(normalizeCrewTypeKey("a")).toBeNull(); // too short (1 char)
    expect(normalizeCrewTypeKey("has!bang")).toBeNull(); // bad char
    expect(normalizeCrewTypeKey("x".repeat(41))).toBeNull(); // too long
    expect(normalizeCrewTypeKey("___")).toBeNull(); // all-underscore → empty
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
  const catalog: CrewTypeDef[] = [
    { key: "street_lights", label: "Street Lights", description: "" },
    { key: "night_paving", label: "Night Paving", description: "" },
  ];

  it("resolves against the default catalog", () => {
    expect(crewTypeLabel("paving")).toBe("Paving");
    expect(crewTypeLabel("line_crew")).toBe("Line Crew");
  });
  it("resolves against a supplied catalog", () => {
    expect(crewTypeLabel("street_lights", catalog)).toBe("Street Lights");
  });
  it("falls back to the raw key for orphans not in the catalog", () => {
    expect(crewTypeLabel("gone_key", catalog)).toBe("gone_key");
  });
  it("returns null for a null key", () => {
    expect(crewTypeLabel(null)).toBeNull();
    expect(crewTypeLabel(null, catalog)).toBeNull();
  });
});
