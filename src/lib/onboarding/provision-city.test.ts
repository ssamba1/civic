// @vitest-environment node

import { provisionCity } from "./provision-city";
import type { CityCandidate } from "./tiger";

const candidate: CityCandidate = {
  name: "Cumming city",
  displayName: "Cumming",
  type: "place",
  geoid: "1320932",
  layerUrl: "https://x/MapServer/4",
  state: "GA",
  stateFips: "13",
  areaLandM2: 19_770_807,
  center: { lng: -84.1338, lat: 34.2061 },
};

const boundaryResponse = {
  ok: true,
  json: async () => ({
    features: [
      {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  }),
} as unknown as Response;

// biome-ignore lint/suspicious/noExplicitAny: minimal fetch stub
const okFetch = vi.fn(async () => boundaryResponse) as any;

function makeDb(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn(async () => result);
  const rpc = vi.fn(() => ({ single }));
  // biome-ignore lint/suspicious/noExplicitAny: structural supabase stub
  return { db: { rpc } as any, rpc, single };
}

describe("provisionCity", () => {
  it("provisions a city via the provision_city RPC and reports created", async () => {
    const { db, rpc } = makeDb({
      data: { id: "city-uuid", created: true },
      error: null,
    });

    const res = await provisionCity({ candidate }, { db, fetchImpl: okFetch });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      cityId: "city-uuid",
      slug: "cumming",
      created: true,
    });
    expect(rpc).toHaveBeenCalledWith(
      "provision_city",
      expect.objectContaining({
        _slug: "cumming",
        _name: "Cumming",
        _state: "GA",
        _center_lng: -84.1338,
        _center_lat: 34.2061,
        _zoom: 14,
      }),
    );
  });

  it("passes null center when TIGER gave no internal point", async () => {
    const { db, rpc } = makeDb({
      data: { id: "c2", created: false },
      error: null,
    });
    const noCenter: CityCandidate = {
      ...candidate,
      center: { lng: Number.NaN, lat: Number.NaN },
    };

    const res = await provisionCity(
      { candidate: noCenter },
      { db, fetchImpl: okFetch },
    );

    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "provision_city",
      expect.objectContaining({ _center_lng: null, _center_lat: null }),
    );
  });

  it("returns GEOMETRY_FETCH when the boundary fetch fails", async () => {
    const { db } = makeDb({ data: null, error: null });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const badFetch = vi.fn(async () => ({ ok: false, status: 500 })) as any;

    const res = await provisionCity({ candidate }, { db, fetchImpl: badFetch });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/^GEOMETRY_FETCH/);
  });

  it("returns PROVISION_DB when the RPC errors", async () => {
    const { db } = makeDb({ data: null, error: { message: "boom" } });

    const res = await provisionCity({ candidate }, { db, fetchImpl: okFetch });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/^PROVISION_DB/);
  });
});
