import { beforeEach, describe, expect, it, vi } from "vitest";

// Per-table awaitable builder. from(table) yields a builder whose chained
// methods return itself; awaiting resolves to responses[table].
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

import { fetchCityCrews, fetchCrewIdsByUser } from "./crews";

beforeEach(() => {
  from.mockClear();
  responses = {};
});

describe("fetchCityCrews", () => {
  it("assembles crews with rosters, leads sorted first", async () => {
    responses = {
      crews: {
        data: [
          {
            id: "cr1",
            team_key: "streets_roads",
            name: "Alpha",
            crew_type: "paving",
            active: true,
          },
        ],
        error: null,
      },
      crew_members: {
        data: [
          { crew_id: "cr1", user_id: "u2", is_lead: false },
          { crew_id: "cr1", user_id: "u1", is_lead: true },
        ],
        error: null,
      },
      users: {
        data: [
          { id: "u1", display_name: "Zoe Lead" },
          { id: "u2", display_name: "Amy Member" },
        ],
        error: null,
      },
    };
    const r = await fetchCityCrews("c1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.crews).toHaveLength(1);
      const members = r.crews[0].members;
      expect(members[0].isLead).toBe(true); // lead first despite name order
      expect(members[0].displayName).toBe("Zoe Lead");
      expect(members).toHaveLength(2);
    }
  });

  it("returns [] when the city has no crews", async () => {
    responses = { crews: { data: [], error: null } };
    const r = await fetchCityCrews("c1");
    expect(r).toEqual({ ok: true, crews: [] });
  });

  it("returns a tagged failure when the crews query errors", async () => {
    responses = { crews: { data: null, error: { message: "no table" } } };
    expect(await fetchCityCrews("c1")).toEqual({
      ok: false,
      error: "crews_query_failed",
    });
  });

  it("still renders crews when membership lookup errors (degrades to empty roster)", async () => {
    responses = {
      crews: {
        data: [
          {
            id: "cr1",
            team_key: "t",
            name: "A",
            crew_type: null,
            active: true,
          },
        ],
        error: null,
      },
      crew_members: { data: null, error: { message: "boom" } },
    };
    const r = await fetchCityCrews("c1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.crews[0].members).toEqual([]);
  });
});

describe("fetchCrewIdsByUser", () => {
  it("maps userId -> crew ids", async () => {
    responses = {
      crews: { data: [{ id: "cr1" }, { id: "cr2" }], error: null },
      crew_members: {
        data: [
          { crew_id: "cr1", user_id: "u1" },
          { crew_id: "cr2", user_id: "u1" },
          { crew_id: "cr1", user_id: "u2" },
        ],
        error: null,
      },
    };
    const map = await fetchCrewIdsByUser("c1");
    expect(map.get("u1")).toEqual(["cr1", "cr2"]);
    expect(map.get("u2")).toEqual(["cr1"]);
  });

  it("returns an empty map on crews-query error", async () => {
    responses = { crews: { data: null, error: { message: "x" } } };
    expect((await fetchCrewIdsByUser("c1")).size).toBe(0);
  });
});
