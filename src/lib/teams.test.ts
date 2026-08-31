// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// categoryToTeam reads getCategoryOverridesSnapshot — mock it so tests are deterministic
vi.mock("@/lib/category-overrides", () => ({
  getCategoryOverridesSnapshot: vi.fn(() => ({})),
}));

import type { ReportCategory } from "@/lib/types";
import {
  categoryToTeam,
  categoryToTeamDefault,
  isValidTeamId,
  TEAM_LIST,
  TEAMS,
  type TeamId,
} from "./teams";

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

describe("TEAMS integrity", () => {
  it("has unique ids", () => {
    const ids = Object.values(TEAMS).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each team's id matches its key in TEAMS", () => {
    for (const [key, meta] of Object.entries(TEAMS)) {
      expect(meta.id).toBe(key);
    }
  });
});

describe("TEAM_LIST", () => {
  it("contains all TEAMS entries", () => {
    expect(TEAM_LIST.length).toBe(Object.keys(TEAMS).length);
  });
});

describe("categoryToTeamDefault", () => {
  it.each(ALL_CATEGORIES)("%s maps to a real TeamId", (cat) => {
    const teamId = categoryToTeamDefault(cat);
    expect(teamId in TEAMS).toBe(true);
  });

  it("pothole → streets_roads", () => {
    expect(categoryToTeamDefault("pothole")).toBe("streets_roads");
  });

  it("streetlight → street_lighting", () => {
    expect(categoryToTeamDefault("streetlight")).toBe("street_lighting");
  });

  it("downed_sign → traffic_engineering", () => {
    expect(categoryToTeamDefault("downed_sign")).toBe("traffic_engineering");
  });

  it("graffiti → graffiti_abatement", () => {
    expect(categoryToTeamDefault("graffiti")).toBe("graffiti_abatement");
  });

  it("illegal_dump → code_enforcement", () => {
    expect(categoryToTeamDefault("illegal_dump")).toBe("code_enforcement");
  });

  it("water_leak → water_utilities", () => {
    expect(categoryToTeamDefault("water_leak")).toBe("water_utilities");
  });

  it("sidewalk_damage → sidewalks_ada", () => {
    expect(categoryToTeamDefault("sidewalk_damage")).toBe("sidewalks_ada");
  });

  it("tree_down → parks_forestry", () => {
    expect(categoryToTeamDefault("tree_down")).toBe("parks_forestry");
  });

  it("debris → environmental_services", () => {
    expect(categoryToTeamDefault("debris")).toBe("environmental_services");
  });

  it("drainage → stormwater", () => {
    expect(categoryToTeamDefault("drainage")).toBe("stormwater");
  });

  it("faded_signage → traffic_engineering", () => {
    expect(categoryToTeamDefault("faded_signage")).toBe("traffic_engineering");
  });

  it("other → general_admin", () => {
    expect(categoryToTeamDefault("other")).toBe("general_admin");
  });
});

describe("categoryToTeam (no overrides)", () => {
  it.each(
    ALL_CATEGORIES,
  )("%s falls back to default when no override", (cat) => {
    expect(categoryToTeam(cat)).toBe(categoryToTeamDefault(cat));
  });
});

describe("categoryToTeam (with override)", () => {
  // categoryToTeam only consults the override snapshot in the browser: the
  // snapshot lives in a `"use client"` module and React throws outright when
  // the server calls into one. This file runs under @vitest-environment node,
  // so `window` has to be stubbed for the client branch to be reachable at all.
  const asBrowser = <T>(fn: () => T): T => {
    const g = globalThis as { window?: unknown };
    const had = "window" in g;
    g.window = g.window ?? ({} as unknown);
    try {
      return fn();
    } finally {
      if (!had) delete g.window;
    }
  };

  it("returns the override team when set", async () => {
    const { getCategoryOverridesSnapshot } = await import(
      "@/lib/category-overrides"
    );
    vi.mocked(getCategoryOverridesSnapshot).mockReturnValueOnce({
      pothole: "parks_forestry" as TeamId,
    });
    expect(asBrowser(() => categoryToTeam("pothole"))).toBe("parks_forestry");
  });

  it("ignores overrides on the server and returns the baseline", async () => {
    // Regression: /r/[token] is a server component that resolves a report's
    // owning team. Reading the client-only snapshot there threw and took the
    // whole page down mid-stream — the visitor saw "A server error occurred"
    // after a 200 had already been sent. Overrides are a per-browser staff
    // preference, so the baseline is the server's correct answer, not a
    // degraded one.
    const { getCategoryOverridesSnapshot } = await import(
      "@/lib/category-overrides"
    );
    // Cleared because the browser test above legitimately calls it, and this
    // assertion is about whether the SERVER path reaches it at all.
    vi.mocked(getCategoryOverridesSnapshot).mockClear();
    vi.mocked(getCategoryOverridesSnapshot).mockReturnValue({
      pothole: "parks_forestry" as TeamId,
    });
    expect(typeof window).toBe("undefined");
    expect(categoryToTeam("pothole")).toBe(categoryToTeamDefault("pothole"));
    expect(getCategoryOverridesSnapshot).not.toHaveBeenCalled();
    vi.mocked(getCategoryOverridesSnapshot).mockReset();
  });
});

describe("isValidTeamId", () => {
  it("returns true for known ids", () => {
    expect(isValidTeamId("streets_roads")).toBe(true);
    expect(isValidTeamId("all")).toBe(true);
  });

  it("returns false for unknown ids", () => {
    expect(isValidTeamId("made_up")).toBe(false);
    expect(isValidTeamId("")).toBe(false);
  });
});
