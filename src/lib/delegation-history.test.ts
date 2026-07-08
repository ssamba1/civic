// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Stub category-overrides used by @/lib/teams
vi.mock("@/lib/category-overrides", () => ({
  getCategoryOverridesSnapshot: () => ({}),
}));

import type { DashboardReport } from "@/lib/dashboard-data";
import {
  buildTimeline,
  resolutionHours,
  similarNearby,
} from "./delegation-history";

// Minimal DashboardReport factory
function makeReport(
  overrides: Partial<DashboardReport> & { id: string },
): DashboardReport {
  return {
    category: "pothole",
    severity: 2,
    status: "open",
    address: "",
    created_at: "2026-06-01T00:00:00Z",
    location: { lat: 34.2, lng: -84.1 },
    photo_public_url: "",
    reporter_id: "u1",
    ...overrides,
  } as DashboardReport;
}

describe("resolutionHours", () => {
  it("returns 12 + severity * 18", () => {
    expect(resolutionHours(makeReport({ id: "r1", severity: 1 }))).toBe(30);
    expect(resolutionHours(makeReport({ id: "r1", severity: 3 }))).toBe(66);
    expect(resolutionHours(makeReport({ id: "r1", severity: 5 }))).toBe(102);
  });
});

describe("buildTimeline", () => {
  const BASE_CREATED = "2026-06-01T00:00:00Z";

  it("open report emits only created event", () => {
    const r = makeReport({ id: "r1", status: "open", created_at: BASE_CREATED });
    const tl = buildTimeline(r, []);
    expect(tl).toHaveLength(1);
    expect(tl[0].kind).toBe("created");
    expect(tl[0].ts).toBe(BASE_CREATED);
  });

  it("rejected report emits created + rejected only", () => {
    const r = makeReport({ id: "r1", status: "rejected", created_at: BASE_CREATED });
    const tl = buildTimeline(r, []);
    expect(tl).toHaveLength(2);
    expect(tl.map((e) => e.kind)).toEqual(["created", "rejected"]);
    const rejectedTs = new Date(Date.parse(BASE_CREATED) + 30 * 60_000).toISOString();
    expect(tl[1].ts).toBe(rejectedTs);
  });

  it("dispatched report emits created + dispatched", () => {
    const r = makeReport({ id: "r1", status: "dispatched", created_at: BASE_CREATED });
    const tl = buildTimeline(r, []);
    const kinds = tl.map((e) => e.kind);
    expect(kinds).toContain("created");
    expect(kinds).toContain("dispatched");
    expect(kinds).not.toContain("in_progress");
    expect(kinds).not.toContain("resolved");
  });

  it("in_progress report emits created + dispatched + in_progress", () => {
    const r = makeReport({ id: "r1", status: "in_progress", created_at: BASE_CREATED });
    const tl = buildTimeline(r, []);
    const kinds = tl.map((e) => e.kind);
    expect(kinds).toContain("dispatched");
    expect(kinds).toContain("in_progress");
    expect(kinds).not.toContain("resolved");
  });

  it("closed report emits all lifecycle events including resolved at correct ts", () => {
    const r = makeReport({ id: "r1", status: "closed", created_at: BASE_CREATED, severity: 2 });
    const tl = buildTimeline(r, []);
    const kinds = tl.map((e) => e.kind);
    expect(kinds).toContain("dispatched");
    expect(kinds).toContain("in_progress");
    expect(kinds).toContain("resolved");
    const hours = 12 + 2 * 18;
    const resolvedTs = new Date(Date.parse(BASE_CREATED) + hours * 3_600_000).toISOString();
    const resolvedEvent = tl.find((e) => e.kind === "resolved");
    expect(resolvedEvent?.ts).toBe(resolvedTs);
  });

  it("merged report emits merged but not resolved", () => {
    const r = makeReport({ id: "r1", status: "merged", created_at: BASE_CREATED });
    const tl = buildTimeline(r, []);
    const kinds = tl.map((e) => e.kind);
    expect(kinds).toContain("merged");
    expect(kinds).not.toContain("resolved");
  });

  it("interleaves reassigned override events in ascending ts order", () => {
    const r = makeReport({ id: "r1", status: "closed", created_at: BASE_CREATED });
    const overrides = [
      { from: "streets_roads" as const, to: "parks_forestry" as const, ts: "2026-06-01T02:00:00Z" },
    ];
    const tl = buildTimeline(r, overrides);
    expect(tl.map((e) => e.kind)).toContain("reassigned");
    for (let i = 1; i < tl.length; i++) {
      expect(Date.parse(tl[i].ts)).toBeGreaterThanOrEqual(Date.parse(tl[i - 1].ts));
    }
  });

  it("multiple override events all appear", () => {
    const r = makeReport({ id: "r1", status: "in_progress", created_at: BASE_CREATED });
    const overrides = [
      { from: "streets_roads" as const, to: "parks_forestry" as const, ts: "2026-06-01T01:00:00Z" },
      { from: "parks_forestry" as const, to: "stormwater" as const, ts: "2026-06-01T03:00:00Z" },
    ];
    const tl = buildTimeline(r, overrides);
    expect(tl.filter((e) => e.kind === "reassigned")).toHaveLength(2);
  });

  it("created event carries defaultTeam string", () => {
    const r = makeReport({ id: "r1", category: "pothole", status: "open" });
    const tl = buildTimeline(r, []);
    const created = tl.find((e) => e.kind === "created");
    if (created?.kind === "created") {
      expect(typeof created.defaultTeam).toBe("string");
      expect(created.defaultTeam).not.toBe("all");
    }
  });
});

describe("similarNearby", () => {
  const target = makeReport({ id: "t1", category: "pothole", location: { lat: 34.2, lng: -84.1 } });

  it("returns 0 for empty corpus", () => {
    expect(similarNearby(target, [])).toBe(0);
  });

  it("excludes target itself by id", () => {
    expect(similarNearby(target, [target])).toBe(0);
  });

  it("excludes reports with different category", () => {
    const other = makeReport({ id: "r2", category: "streetlight", location: { lat: 34.2, lng: -84.1 } });
    expect(similarNearby(target, [other])).toBe(0);
  });

  it("counts same-category report within radius", () => {
    const near = makeReport({ id: "r2", category: "pothole", location: { lat: 34.2001, lng: -84.1001 } });
    expect(similarNearby(target, [near], 500)).toBe(1);
  });

  it("excludes same-category report outside radius", () => {
    const far = makeReport({ id: "r2", category: "pothole", location: { lat: 34.3, lng: -84.2 } });
    expect(similarNearby(target, [far], 500)).toBe(0);
  });

  it("respects custom radius boundary", () => {
    const mid = makeReport({ id: "r2", category: "pothole", location: { lat: 34.201, lng: -84.1 } });
    expect(similarNearby(target, [mid], 50)).toBe(0);
    expect(similarNearby(target, [mid], 200)).toBe(1);
  });

  it("counts multiple nearby same-category reports", () => {
    const near1 = makeReport({ id: "r2", category: "pothole", location: { lat: 34.2001, lng: -84.1 } });
    const near2 = makeReport({ id: "r3", category: "pothole", location: { lat: 34.2002, lng: -84.1 } });
    expect(similarNearby(target, [near1, near2])).toBe(2);
  });
});

