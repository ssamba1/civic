import { describe, expect, it } from "vitest";
import { isRouteAllowed } from "./navigation";

describe("isRouteAllowed", () => {
  it("allows resident-safe routes for residents", () => {
    expect(isRouteAllowed("/report", "resident")).toBe(true);
    expect(isRouteAllowed("/user/my-reports", "resident")).toBe(true);
    expect(isRouteAllowed("/city/cumming", "anon")).toBe(true);
    expect(isRouteAllowed("/city/cumming/map", "resident")).toBe(true);
  });
  it("blocks staff routes for residents and anon", () => {
    expect(isRouteAllowed("/staff", "resident")).toBe(false);
    expect(isRouteAllowed("/staff/map", "anon")).toBe(false);
  });
  it("allows staff routes for staff roles", () => {
    expect(isRouteAllowed("/staff", "staff_dispatcher")).toBe(true);
    expect(isRouteAllowed("/staff/settings", "admin")).toBe(true);
  });
  it("rejects off-site, protocol-relative, and unknown routes", () => {
    expect(isRouteAllowed("https://evil.com", "resident")).toBe(false);
    expect(isRouteAllowed("//evil.com", "resident")).toBe(false);
    expect(isRouteAllowed("/does-not-exist", "resident")).toBe(false);
    expect(isRouteAllowed("/report?email=a@b.com", "resident")).toBe(false);
  });
});
