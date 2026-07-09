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

import type { CityListItem } from "./cities";
import { cityStatus, listCities } from "./cities";

beforeEach(() => {
  from.mockClear();
  responses = {};
});

describe("cityStatus", () => {
  it("returns 'live' when active is true", () => {
    expect(cityStatus({ active: true })).toBe("live");
  });

  it("returns 'draft' when active is false", () => {
    expect(cityStatus({ active: false })).toBe("draft");
  });
});

describe("listCities", () => {
  it("returns cities from the DB", async () => {
    const row: CityListItem = {
      id: "c1",
      slug: "cumming-ga",
      name: "Cumming",
      state: "GA",
      active: true,
      created_at: "2024-01-01T00:00:00Z",
    };
    responses = { cities: { data: [row], error: null } };
    const result = await listCities();
    expect(result).toEqual([row]);
  });

  it("returns [] on DB error", async () => {
    responses = { cities: { data: null, error: { message: "boom" } } };
    expect(await listCities()).toEqual([]);
  });

  it("returns [] when data is null with no error", async () => {
    responses = { cities: { data: null, error: null } };
    expect(await listCities()).toEqual([]);
  });

  it("returns [] when data is empty array", async () => {
    responses = { cities: { data: [], error: null } };
    expect(await listCities()).toEqual([]);
  });
});
