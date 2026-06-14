// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import { deriveBacklogAgeDistribution, deriveSlaRisk } from "./derive";

const now = new Date("2026-06-14T12:00:00Z").getTime();
const HOUR_MS = 3_600_000;

function makeReport(overrides: Partial<DashboardReport> = {}): DashboardReport {
  return {
    id: "r1",
    category: "pothole", // CATEGORY_SLA_TARGETS.pothole = 72h
    severity: 3,
    status: "open",
    address: "100 Main St",
    location: { lat: 34.2, lng: -84.1 },
    photo_public_url: "",
    created_at: new Date(now).toISOString(),
    reporter_id: "reporter-1",
    ...overrides,
  };
}

// Helper: a report filed `h` hours before `now`.
function aged(h: number, overrides: Partial<DashboardReport> = {}) {
  return makeReport({
    created_at: new Date(now - h * HOUR_MS).toISOString(),
    ...overrides,
  });
}

describe("deriveBacklogAgeDistribution", () => {
  it("buckets OPEN backlog by age-since-filed", () => {
    const reports = [
      aged(2, { id: "a" }), // <24h
      aged(120, { id: "b" }), // 5d -> 3-7d
      aged(120, { id: "c" }), // 5d -> 3-7d
    ];
    const dist = deriveBacklogAgeDistribution(reports, now);
    expect(dist.find((b) => b.label === "<24h")?.count).toBe(1);
    expect(dist.find((b) => b.label === "3-7d")?.count).toBe(2);
  });

  it("excludes closed/merged/rejected (only the live backlog ages)", () => {
    const reports = [
      aged(2, { id: "a", status: "open" }),
      aged(2, { id: "b", status: "closed" }),
      aged(2, { id: "c", status: "merged" }),
      aged(2, { id: "d", status: "dispatched" }),
    ];
    const total = deriveBacklogAgeDistribution(reports, now).reduce(
      (s, b) => s + b.count,
      0,
    );
    expect(total).toBe(2); // open + dispatched
  });
});

describe("deriveSlaRisk", () => {
  it("classifies backlog vs the per-category SLA window (pothole = 72h)", () => {
    const reports = [
      aged(10, { id: "a" }), // on track (< 57.6h)
      aged(60, { id: "b" }), // at risk (>= 80% of 72h, < 72h)
      aged(80, { id: "c" }), // breached (>= 72h)
    ];
    expect(deriveSlaRisk(reports, now)).toEqual({
      on_track: 1,
      at_risk: 1,
      breached: 1,
    });
  });

  it("ignores resolved/terminal reports — only the open backlog is at risk", () => {
    const reports = [
      aged(80, { id: "a", status: "closed" }),
      aged(80, { id: "b", status: "rejected" }),
      aged(10, { id: "c", status: "open" }),
    ];
    expect(deriveSlaRisk(reports, now)).toEqual({
      on_track: 1,
      at_risk: 0,
      breached: 0,
    });
  });
});
