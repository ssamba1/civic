import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./proxy";

describe("native sync login-wall exemption", () => {
  it("allows bearer-authenticated native delivery to reach its route", () => {
    expect(isPublicRoute("/api/reports/sync")).toBe(true);
  });

  it("continues to gate operator surfaces", () => {
    expect(isPublicRoute("/admin")).toBe(false);
    expect(isPublicRoute("/requests")).toBe(false);
  });
});
