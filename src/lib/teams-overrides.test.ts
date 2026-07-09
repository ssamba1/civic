// @vitest-environment node
/**
 * teams-overrides.ts is "use client" and depends on React hooks
 * (useSyncExternalStore, useCallback, useEffect) — these cannot be called
 * outside a React render. We test only the pure, hook-free exports:
 *   - getReportTeam (override map lookup + category fallback)
 *   - getReportHistory (history map lookup)
 *
 * The hook (useTeamOverrides) and localStorage persistence are integration
 * concerns that belong in a browser/jsdom Playwright or component test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub React hooks so the module loads in Node without crashing
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: (fn: unknown) => fn,
    useEffect: vi.fn(),
    useSyncExternalStore: vi.fn(() => ({})),
  };
});

// Stub the reactive-store util
vi.mock("@/lib/utils/reactive-store", () => ({
  createListenerHub: () => ({ subscribe: vi.fn(), emit: vi.fn() }),
  frozenSnapshot: () => () => ({}),
}));

// Stub schema validation
vi.mock("@/lib/schemas", () => ({
  validateTeamOverrides: (x: unknown) => x,
}));

// Stub demo-mode and staff actions
vi.mock("@/lib/demo-mode", () => ({ DEMO_MODE: true }));
vi.mock("@/app/staff/actions", () => ({
  reassignReportTeam: vi.fn(() => Promise.resolve({ ok: true })),
}));

// Stub category-overrides (used transitively by @/lib/teams)
vi.mock("@/lib/category-overrides", () => ({
  getCategoryOverridesSnapshot: () => ({}),
}));

import { getReportHistory, getReportTeam } from "./teams-overrides";

beforeEach(() => {
  // nothing to reset — these are pure functions with explicit map args
});

describe("getReportTeam", () => {
  it("returns override from the map when present", () => {
    const report = {
      id: "r1",
      category: "pothole" as const,
      assigned_team: undefined,
    };
    const overrides = { r1: "streets_roads" as const };
    expect(getReportTeam(report, overrides)).toBe("streets_roads");
  });

  it("falls back to assigned_team when no override", () => {
    const report = {
      id: "r1",
      category: "pothole" as const,
      assigned_team: "parks_forestry" as const,
    };
    expect(getReportTeam(report, {})).toBe("parks_forestry");
  });

  it("falls back to categoryToTeam when no override or assigned_team", () => {
    const report = {
      id: "r1",
      category: "pothole" as const,
      assigned_team: undefined,
    };
    // categoryToTeam("pothole") → "streets_roads" per teams.ts mapping
    const result = getReportTeam(report, {});
    expect(typeof result).toBe("string");
    expect(result).not.toBe("all");
  });

  it("override takes precedence over assigned_team", () => {
    const report = {
      id: "r1",
      category: "pothole" as const,
      assigned_team: "parks_forestry" as const,
    };
    const overrides = { r1: "stormwater" as const };
    expect(getReportTeam(report, overrides)).toBe("stormwater");
  });

  it("different report id does not pick up another report's override", () => {
    const report = {
      id: "r2",
      category: "pothole" as const,
      assigned_team: undefined,
    };
    const overrides = { r1: "stormwater" as const };
    // Should NOT return stormwater for r2
    expect(getReportTeam(report, overrides)).not.toBe("stormwater");
  });
});

describe("getReportHistory", () => {
  it("returns empty array when no history recorded", () => {
    expect(getReportHistory("r1", {})).toEqual([]);
  });

  it("returns the events for the given report id", () => {
    const events = [
      {
        from: "streets_roads" as const,
        to: "parks_forestry" as const,
        ts: "2026-06-01T10:00:00Z",
      },
      {
        from: "parks_forestry" as const,
        to: "stormwater" as const,
        ts: "2026-06-01T11:00:00Z",
      },
    ];
    const history = { r1: events };
    expect(getReportHistory("r1", history)).toBe(events);
  });

  it("does not cross-contaminate between report ids", () => {
    const history = {
      r1: [
        {
          from: "streets_roads" as const,
          to: "parks_forestry" as const,
          ts: "2026-06-01T10:00:00Z",
        },
      ],
    };
    expect(getReportHistory("r2", history)).toEqual([]);
  });
});
