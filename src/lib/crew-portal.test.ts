// @vitest-environment node

import { DEFAULT_CREW_TYPE_KEYS } from "@/lib/crew-types";
import {
  categoriesForCrewType,
  isPortalCrewType,
  portalLabel,
} from "./crew-portal";

// categoriesForCrewType is derived from RULES in work-order-rules.ts (verified
// there before writing these): paving -> pothole only; cleanup -> graffiti,
// illegal_dump, debris; every DEFAULT_CREW_TYPE_KEYS entry appears in RULES at
// least once, so none should come back empty.

describe("categoriesForCrewType", () => {
  it("returns the pothole category for paving", () => {
    expect(categoriesForCrewType("paving")).toContain("pothole");
    expect(categoriesForCrewType("paving")).toEqual(["pothole"]);
  });

  it("returns multiple categories for cleanup (spans several report types)", () => {
    const categories = categoriesForCrewType("cleanup");
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories).toEqual(
      expect.arrayContaining(["graffiti", "illegal_dump", "debris"]),
    );
  });

  it("returns an empty array for a crew type unknown to RULES", () => {
    expect(categoriesForCrewType("not_a_real_crew_type")).toEqual([]);
  });

  it.each(
    DEFAULT_CREW_TYPE_KEYS,
  )("every default crew type (%s) maps to at least one category", (crewType) => {
    expect(categoriesForCrewType(crewType).length).toBeGreaterThan(0);
  });
});

describe("isPortalCrewType", () => {
  it("is true for built-in default crew types", () => {
    expect(isPortalCrewType("paving")).toBe(true);
    expect(isPortalCrewType("cleanup")).toBe(true);
  });

  it("is false for a city-custom or unknown crew type", () => {
    expect(isPortalCrewType("custom_city_type")).toBe(false);
    expect(isPortalCrewType("")).toBe(false);
  });
});

describe("portalLabel", () => {
  it("returns the display label for a known crew type", () => {
    expect(portalLabel("paving")).toBe("Paving");
  });

  it("falls back to the raw key for an unrecognized crew type", () => {
    expect(portalLabel("custom_city_type")).toBe("custom_city_type");
  });
});
