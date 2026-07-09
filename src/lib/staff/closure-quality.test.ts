import { describe, expect, it } from "vitest";
import { isGenericClosure } from "./closure-quality";

describe("isGenericClosure", () => {
  // ---- should block (generic) ----
  it.each([
    // exact matches
    ["done"],
    ["Done"],
    ["DONE"],
    ["  done  "],
    ["fixed"],
    ["Fixed."],
    ["closed"],
    ["resolved"],
    ["complete"],
    ["completed"],
    ["n/a"],
    ["N/A"],
    ["NA"],
    ["ok"],
    ["okay"],
    ["handled"],
    ["addressed"],
    ["no evidence observed"],
    ["No Evidence Observed"],
    ["no issues found"],
    ["no issue found"],
    ["no issue detected"],
    ["nothing found"],
    ["no action required"],
    ["no action needed"],
    ["repaired"],
    // short prefix matches (length <= MIN_LENGTH + 10 = 25)
    ["done, see photos"],
    ["fixed it"],
    ["resolved - notes attached"],
    ["closed per supervisor"],
    // empty / whitespace
    [""],
    ["   "],
    ["..."],
    ["!!!"],
  ])("blocks %j", (reason) => {
    expect(isGenericClosure(reason)).toBe(true);
  });

  // ---- should pass (specific enough) ----
  it.each([
    // Specific descriptions
    ["Crew filled the pothole with cold patch asphalt on Oak St."],
    ["Replaced burned-out bulb at intersection of Main and 2nd."],
    ["Graffiti removed with solvent wash, surface repainted gray."],
    ["Tree removed and stump ground down; debris hauled away."],
    ["Water leak sealed — replaced corroded 2-inch coupling at 123 Elm."],
    // Long enough with 'resolved'/'repaired' prefix to pass length guard
    [
      "Resolved after crew cleared storm debris blocking drain inlet at 5th Ave.",
    ],
    ["Repaired the 4-inch pothole on Main Street using hot-mix asphalt."],
    // Unusual but specific
    ["No issue found after inspection — resident confirmed location in error."],
  ])("passes %j", (reason) => {
    expect(isGenericClosure(reason)).toBe(false);
  });
});
