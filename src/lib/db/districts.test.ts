// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };
vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({
    rpc: (_fn: string, _args: unknown) => Promise.resolve(rpcResult),
  }),
}));

import { fetchDistrictRollups } from "./districts";

describe("fetchDistrictRollups", () => {
  it("maps + coerces rpc rows to camelCase DistrictRollup", async () => {
    rpcResult = {
      data: [
        {
          district_id: "d1",
          name: "District 1",
          rep_name: "Rep. A",
          total: "59",
          open_count: "13",
          closed: "46",
          avg_resolution_hours: "0",
        },
      ],
      error: null,
    };
    const rows = await fetchDistrictRollups("city1");
    expect(rows).toEqual([
      {
        districtId: "d1",
        name: "District 1",
        repName: "Rep. A",
        total: 59,
        openCount: 13,
        closed: 46,
        avgResolutionHours: 0,
      },
    ]);
  });

  it("returns [] when cityId is blank (no rpc)", async () => {
    expect(await fetchDistrictRollups("")).toEqual([]);
  });

  it("returns [] on rpc error (degrade)", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    expect(await fetchDistrictRollups("city1")).toEqual([]);
  });
});
