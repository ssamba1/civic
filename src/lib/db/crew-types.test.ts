import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CREW_TYPES } from "@/lib/crew-types";

// Awaitable query builder: every chained method returns the builder; awaiting it
// resolves to the configured { data, error }.
let result: { data: unknown; error: unknown };
function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}
const from = vi.fn(() => makeBuilder());
vi.mock("@/lib/db/client", () => ({ createServerClient: () => ({ from }) }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { fetchActiveCrewTypeDefs, fetchCityCrewTypes } from "./crew-types";

beforeEach(() => {
  from.mockClear();
});

describe("fetchCityCrewTypes", () => {
  it("returns rows on success", async () => {
    result = {
      data: [
        {
          id: "1",
          key: "paving",
          label: "Paving",
          description: "d",
          active: true,
        },
      ],
      error: null,
    };
    const r = await fetchCityCrewTypes("c1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.types).toHaveLength(1);
  });

  it("returns tagged failure on a missing-table error (PGRST205)", async () => {
    result = { data: null, error: { code: "PGRST205", message: "missing" } };
    const r = await fetchCityCrewTypes("c1");
    expect(r).toEqual({ ok: false, error: "crew_types_query_failed" });
  });

  it("returns tagged failure on any other error", async () => {
    result = { data: null, error: { code: "XX", message: "boom" } };
    expect((await fetchCityCrewTypes("c1")).ok).toBe(false);
  });
});

describe("fetchActiveCrewTypeDefs (fallback contract)", () => {
  it("maps active rows to defs", async () => {
    result = {
      data: [
        {
          id: "1",
          key: "paving",
          label: "Paving",
          description: "roads",
          active: true,
        },
        { id: "2", key: "old", label: "Old", description: "x", active: false },
      ],
      error: null,
    };
    const defs = await fetchActiveCrewTypeDefs("c1");
    expect(defs).toEqual([
      { key: "paving", label: "Paving", description: "roads" },
    ]);
  });

  it("falls back to DEFAULT_CREW_TYPES when the query fails", async () => {
    result = { data: null, error: { code: "PGRST205", message: "missing" } };
    expect(await fetchActiveCrewTypeDefs("c1")).toBe(DEFAULT_CREW_TYPES);
  });

  it("falls back to DEFAULT_CREW_TYPES when the city has no active rows", async () => {
    result = {
      data: [
        { id: "2", key: "old", label: "Old", description: "x", active: false },
      ],
      error: null,
    };
    expect(await fetchActiveCrewTypeDefs("c1")).toBe(DEFAULT_CREW_TYPES);
  });
});
