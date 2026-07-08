import { describe, expect, it } from "vitest";
import type { ReportCategory } from "@/lib/types";
import {
  getAgencyResponsible,
  getAllServices,
  getDepartment,
  getService,
} from "./services";

const ALL_CATEGORIES: ReportCategory[] = [
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
  "debris",
  "drainage",
  "faded_signage",
  "other",
];

describe("getAllServices", () => {
  it("returns one service definition per category, each spec-complete", () => {
    const services = getAllServices();
    expect(services).toHaveLength(ALL_CATEGORIES.length);
    for (const s of services) {
      expect(s.service_code).toBeTruthy();
      expect(s.service_name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(typeof s.metadata).toBe("boolean");
      expect(["realtime", "batch", "blackbox"]).toContain(s.type);
      expect(s.group).toBeTruthy();
    }
  });

  it("service codes are unique", () => {
    const codes = getAllServices().map((s) => s.service_code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("getService", () => {
  it("resolves a known code", () => {
    expect(getService("pothole")?.service_name).toBe("Pothole");
  });

  it("returns undefined for an unknown code", () => {
    expect(getService("not_a_service")).toBeUndefined();
    expect(getService("")).toBeUndefined();
  });
});

describe("getDepartment / getAgencyResponsible", () => {
  it("maps every category to a department", () => {
    for (const c of ALL_CATEGORIES) {
      expect(getDepartment(c)).toBeTruthy();
    }
  });

  it("builds a human agency name from city + department", () => {
    expect(getAgencyResponsible("pothole", "Cumming")).toBe(
      "Cumming Public Works",
    );
    expect(getAgencyResponsible("tree_down", "Cumming")).toBe(
      "Cumming Parks & Recreation",
    );
  });
});
