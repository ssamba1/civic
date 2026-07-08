import { describe, expect, it } from "vitest";
import { buildWorkOrderPrompt, WORK_ORDER_PROMPT } from "./prompt";

describe("buildWorkOrderPrompt", () => {
  it("with no custom types returns the base prompt unchanged", () => {
    expect(buildWorkOrderPrompt([])).toBe(WORK_ORDER_PROMPT);
  });
  it("injects each custom type with its description before ## DEPARTMENT", () => {
    const out = buildWorkOrderPrompt([
      {
        name: "street_lights",
        description:
          "maintains and repairs street light fixtures poles and wiring across the city",
      },
    ]);
    expect(out).toContain("## CITY-SPECIFIC CREW TYPES");
    expect(out).toContain("street_lights");
    expect(out).toContain("maintains and repairs street light fixtures");
    expect(out.indexOf("## CITY-SPECIFIC CREW TYPES")).toBeLessThan(
      out.indexOf("## DEPARTMENT"),
    );
    // Base sections all survive.
    expect(out).toContain("## CREW TYPE");
    expect(out).toContain("## OUTPUT");
  });
});
