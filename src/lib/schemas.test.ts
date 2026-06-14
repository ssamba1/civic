// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  validateCategoryOverrides,
  validateCompletions,
  validateCsatRatings,
  validateCustomCategories,
  validateTeamOverrides,
  validateUpvotes,
} from "./schemas";

/**
 * Tests for the localStorage validation layer (schemas.ts). Each validator is
 * the trust boundary between untrusted persisted JSON and the typed in-memory
 * stores, so the contract under test is: valid input round-trips, and ANY
 * malformed shape degrades to a safe empty default rather than throwing.
 */

// A real team id that is valid and != "all" (the schemas reject "all").
const TEAM = "parks_forestry";

describe("validateCustomCategories", () => {
  it("keeps a fully valid row", () => {
    const input = [
      { id: "custom_x", label: "Crosswalk", color: "#fff", team: TEAM },
    ];
    expect(validateCustomCategories(input)).toEqual(input);
  });

  it("returns [] for non-array input", () => {
    expect(validateCustomCategories(null)).toEqual([]);
    expect(validateCustomCategories(undefined)).toEqual([]);
    expect(validateCustomCategories({})).toEqual([]);
    expect(validateCustomCategories("nope")).toEqual([]);
  });

  it("drops the whole result if any row is invalid (strict array parse)", () => {
    // id must start with custom_
    expect(
      validateCustomCategories([
        { id: "x", label: "L", color: "#000", team: TEAM },
      ]),
    ).toEqual([]);
    // label must be non-empty
    expect(
      validateCustomCategories([
        { id: "custom_x", label: "", color: "#000", team: TEAM },
      ]),
    ).toEqual([]);
    // team must be valid and not "all"
    expect(
      validateCustomCategories([
        { id: "custom_x", label: "L", color: "#000", team: "all" },
      ]),
    ).toEqual([]);
    expect(
      validateCustomCategories([
        { id: "custom_x", label: "L", color: "#000", team: "bogus" },
      ]),
    ).toEqual([]);
  });

  it("rejects rows missing fields", () => {
    expect(validateCustomCategories([{ id: "custom_x" }])).toEqual([]);
  });
});

describe("validateCategoryOverrides", () => {
  it("keeps string->validTeam entries", () => {
    expect(validateCategoryOverrides({ pothole: TEAM })).toEqual({
      pothole: TEAM,
    });
  });

  it("returns {} for non-object input", () => {
    expect(validateCategoryOverrides(null)).toEqual({});
    expect(validateCategoryOverrides(undefined)).toEqual({});
    expect(validateCategoryOverrides([])).toEqual({}); // arrays have no string-keyed team values
    expect(validateCategoryOverrides("str")).toEqual({});
  });

  it("filters out invalid values but keeps valid siblings", () => {
    const out = validateCategoryOverrides({
      pothole: TEAM, // keep
      graffiti: "all", // drop (all banned)
      debris: "not_a_team", // drop (invalid)
      drainage: 123, // drop (non-string)
      streetlight: null, // drop (non-string)
    });
    expect(out).toEqual({ pothole: TEAM });
  });
});

describe("validateTeamOverrides", () => {
  it("shares the category-override contract (id->validTeam)", () => {
    expect(validateTeamOverrides({ "report-1": TEAM })).toEqual({
      "report-1": TEAM,
    });
  });

  it("drops invalid/all/non-string values", () => {
    expect(
      validateTeamOverrides({ a: TEAM, b: "all", c: "bogus", d: 5 }),
    ).toEqual({ a: TEAM });
  });

  it("returns {} for non-object input", () => {
    expect(validateTeamOverrides(null)).toEqual({});
    expect(validateTeamOverrides(42)).toEqual({});
  });
});

describe("validateCsatRatings", () => {
  it("keeps only up/down verdicts", () => {
    const out = validateCsatRatings({
      a: "up",
      b: "down",
      c: "sideways",
      d: 1,
      e: null,
    });
    expect(out).toEqual({ a: "up", b: "down" });
  });

  it("returns {} for non-object input", () => {
    expect(validateCsatRatings(null)).toEqual({});
    expect(validateCsatRatings(undefined)).toEqual({});
    expect(validateCsatRatings("up")).toEqual({});
  });
});

describe("validateCompletions", () => {
  it("keeps completedAt and optional afterPhoto", () => {
    const out = validateCompletions({
      r1: { completedAt: "2026-06-06T00:00:00.000Z", afterPhoto: "data:," },
      r2: { completedAt: "2026-06-07T00:00:00.000Z" },
    });
    expect(out.r1).toEqual({
      completedAt: "2026-06-06T00:00:00.000Z",
      afterPhoto: "data:,",
    });
    expect(out.r2).toEqual({
      completedAt: "2026-06-07T00:00:00.000Z",
      afterPhoto: undefined,
    });
  });

  it("drops entries without a string completedAt", () => {
    const out = validateCompletions({
      good: { completedAt: "2026-06-06T00:00:00.000Z" },
      noTs: { afterPhoto: "data:," },
      badTs: { completedAt: 123 },
      nullEntry: null,
      notObj: "x",
    });
    expect(Object.keys(out)).toEqual(["good"]);
  });

  it("ignores a non-string afterPhoto (keeps the row, drops the photo)", () => {
    const out = validateCompletions({
      r1: { completedAt: "2026-06-06T00:00:00.000Z", afterPhoto: 42 },
    });
    expect(out.r1).toEqual({
      completedAt: "2026-06-06T00:00:00.000Z",
      afterPhoto: undefined,
    });
  });

  it("returns {} for non-object input", () => {
    expect(validateCompletions(null)).toEqual({});
    expect(validateCompletions(undefined)).toEqual({});
  });
});

describe("validateUpvotes", () => {
  it("returns a Set of the string members", () => {
    const out = validateUpvotes(["a", "b", "a"]);
    expect(out).toBeInstanceOf(Set);
    expect([...out].sort()).toEqual(["a", "b"]);
  });

  it("filters non-string members", () => {
    const out = validateUpvotes(["a", 1, null, "b", { x: 1 }]);
    expect([...out].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty Set for non-array input", () => {
    expect(validateUpvotes(null).size).toBe(0);
    expect(validateUpvotes(undefined).size).toBe(0);
    expect(validateUpvotes({}).size).toBe(0);
    expect(validateUpvotes("ab").size).toBe(0);
  });
});
