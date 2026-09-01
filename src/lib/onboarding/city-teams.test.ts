// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

let responses: Record<string, { data: unknown; error: unknown }>;
function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in"]) {
    builder[m] = () => builder;
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock of the supabase query builder
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(responses[table] ?? { data: [], error: null });
  return builder;
}
const from = vi.fn((table: string) => makeBuilder(table));
vi.mock("@/lib/db/client", () => ({ createServerClient: () => ({ from }) }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { categoryToTeamDefault } from "@/lib/teams";
import {
  type CityTeamConfig,
  fetchCityTeams,
  resolveCategoryTeam,
  resolveTeamKeyForCategory,
} from "./city-teams";

beforeEach(() => {
  from.mockClear();
  responses = {};
});

const STREETS_CONFIG: CityTeamConfig = {
  teamKey: "streets_roads",
  label: "Streets",
  enabled: true,
  categories: ["pothole"],
};

const PARKS_CONFIG: CityTeamConfig = {
  teamKey: "parks_forestry",
  label: "Parks",
  enabled: true,
  categories: ["tree_down", "graffiti"],
};

describe("resolveCategoryTeam", () => {
  it("returns the matching team config when a category is found", () => {
    const result = resolveCategoryTeam(
      [STREETS_CONFIG, PARKS_CONFIG],
      "pothole",
    );
    expect(result).toBe(STREETS_CONFIG);
  });

  it("returns first match when multiple teams claim a category", () => {
    const dup: CityTeamConfig = {
      teamKey: "general_admin",
      label: "Admin",
      enabled: true,
      categories: ["pothole"],
    };
    const result = resolveCategoryTeam([STREETS_CONFIG, dup], "pothole");
    expect(result).toBe(STREETS_CONFIG);
  });

  it("returns null when no team owns the category", () => {
    expect(resolveCategoryTeam([STREETS_CONFIG], "graffiti")).toBeNull();
  });

  it("returns null for an empty config list", () => {
    expect(resolveCategoryTeam([], "pothole")).toBeNull();
  });

  it("picks correct team for multi-category configs", () => {
    const result = resolveCategoryTeam(
      [STREETS_CONFIG, PARKS_CONFIG],
      "tree_down",
    );
    expect(result).toBe(PARKS_CONFIG);
  });
});

describe("resolveTeamKeyForCategory", () => {
  it("returns the city team key when the DB has a match", async () => {
    responses = {
      city_teams: {
        data: [
          {
            team_key: "streets_roads",
            label: "Streets",
            enabled: true,
            categories: ["pothole"],
          },
        ],
        error: null,
      },
    };
    const result = await resolveTeamKeyForCategory("city-1", "pothole");
    expect(result).toBe("streets_roads");
  });

  it("falls back to categoryToTeamDefault when no city match", async () => {
    responses = { city_teams: { data: [], error: null } };
    const result = await resolveTeamKeyForCategory("city-1", "pothole");
    expect(result).toBe(categoryToTeamDefault("pothole"));
  });

  it("falls back when cityId is null", async () => {
    const result = await resolveTeamKeyForCategory(null, "pothole");
    expect(result).toBe(categoryToTeamDefault("pothole"));
  });

  it("falls back when cityId is undefined", async () => {
    const result = await resolveTeamKeyForCategory(undefined, "water_leak");
    expect(result).toBe(categoryToTeamDefault("water_leak"));
  });

  it("falls back on DB error (degrades gracefully)", async () => {
    responses = { city_teams: { data: null, error: { message: "timeout" } } };
    const result = await resolveTeamKeyForCategory("city-1", "graffiti");
    expect(result).toBe(categoryToTeamDefault("graffiti"));
  });

  it("falls back when team_key is not a valid TEAMS key", async () => {
    responses = {
      city_teams: {
        data: [
          {
            team_key: "unknown_team",
            label: "Unknown",
            enabled: true,
            categories: ["pothole"],
          },
        ],
        error: null,
      },
    };
    const result = await resolveTeamKeyForCategory("city-1", "pothole");
    expect(result).toBe(categoryToTeamDefault("pothole"));
  });
});

describe("fetchCityTeams", () => {
  it("maps DB rows to CityTeamConfig objects", async () => {
    responses = {
      city_teams: {
        data: [
          {
            team_key: "stormwater",
            label: "Stormwater Div",
            enabled: true,
            categories: ["drainage"],
          },
        ],
        error: null,
      },
    };
    const result = await fetchCityTeams("city-1");
    expect(result).toHaveLength(1);
    expect(result[0].teamKey).toBe("stormwater");
    expect(result[0].categories).toContain("drainage");
  });

  it("returns [] on DB error", async () => {
    responses = { city_teams: { data: null, error: { message: "err" } } };
    expect(await fetchCityTeams("city-1")).toEqual([]);
  });

  it("returns [] when no rows", async () => {
    responses = { city_teams: { data: [], error: null } };
    expect(await fetchCityTeams("city-1")).toEqual([]);
  });

  it("returns [] when the client itself cannot be constructed", async () => {
    // Regression: createServerClient throws when server env is missing or
    // invalid, and that throw used to happen OUTSIDE the error guard. A
    // deployment with an unset service-role key 500'd the whole routing page
    // instead of degrading to the static presets every caller expects. Found by
    // running the app, not by building it. Tsc and the build were both clean.
    from.mockImplementationOnce(() => {
      throw new Error(
        "Missing or invalid server environment variables: SUPABASE_SERVICE_ROLE_KEY",
      );
    });
    await expect(fetchCityTeams("city-1")).resolves.toEqual([]);
  });
});
