import { describe, expect, it } from "vitest";
import { deriveScope, isStaffRole } from "./scope";

describe("deriveScope", () => {
  it("maps a null user row to anon", () => {
    expect(deriveScope(null)).toEqual({
      userId: null,
      role: "anon",
      citySlug: null,
    });
  });
  it("maps a resident row", () => {
    const scope = deriveScope({
      id: "u1",
      role: "resident",
      cities: { slug: "cumming" },
    });
    expect(scope).toEqual({ userId: "u1", role: "resident", citySlug: "cumming" });
  });
  it("maps a staff row and flags staff", () => {
    const scope = deriveScope({
      id: "u2",
      role: "admin",
      cities: { slug: "cumming" },
    });
    expect(scope.role).toBe("admin");
    expect(isStaffRole(scope.role)).toBe(true);
    expect(isStaffRole("resident")).toBe(false);
  });
});
