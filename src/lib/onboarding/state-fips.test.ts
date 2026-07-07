// @vitest-environment node
import { normalizeState, toStateFips } from "./state-fips";

describe("normalizeState", () => {
  it("resolves a 2-letter abbreviation (any case)", () => {
    expect(normalizeState("GA")).toEqual({ abbr: "GA", fips: "13" });
    expect(normalizeState("ga")).toEqual({ abbr: "GA", fips: "13" });
  });

  it("resolves a full state name (any case, trimmed)", () => {
    expect(normalizeState("Georgia")).toEqual({ abbr: "GA", fips: "13" });
    expect(normalizeState("  north carolina ")).toEqual({
      abbr: "NC",
      fips: "37",
    });
    expect(normalizeState("District of Columbia")).toEqual({
      abbr: "DC",
      fips: "11",
    });
  });

  it("returns null for unknown / empty input", () => {
    expect(normalizeState("Atlantis")).toBeNull();
    expect(normalizeState("")).toBeNull();
    expect(normalizeState("   ")).toBeNull();
  });
});

describe("toStateFips", () => {
  it("returns the FIPS string or null", () => {
    expect(toStateFips("TX")).toBe("48");
    expect(toStateFips("Texas")).toBe("48");
    expect(toStateFips("nope")).toBeNull();
  });
});
