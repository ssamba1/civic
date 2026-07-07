// @vitest-environment node
import {
  cleanCityName,
  fetchCityBoundary,
  resolveCityCandidates,
  slugify,
  zoomForArea,
} from "./tiger";

// Fake fetch routed by URL substring. Each route value is the JSON payload, or
// the sentinel "throw" / "http500" to simulate failures.
type Route = [match: string, payload: unknown];
function fakeFetch(routes: Route[]) {
  // biome-ignore lint/suspicious/noExplicitAny: minimal fetch stub for tests
  return vi.fn(async (url: any) => {
    const u = String(url);
    for (const [match, payload] of routes) {
      if (!u.includes(match)) continue;
      if (payload === "throw") throw new Error("network down");
      if (payload === "http500") return { ok: false, status: 500 } as Response;
      return { ok: true, json: async () => payload } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ features: [] }),
    } as unknown as Response;
  });
}

const cummingPlace = {
  features: [
    {
      attributes: {
        NAME: "Cumming city",
        GEOID: "1320932",
        INTPTLON: "-084.1338478",
        INTPTLAT: "+34.2060666",
        AREALAND: "19770807",
      },
    },
  ],
};

describe("cleanCityName", () => {
  it("strips LSAD suffixes but keeps County", () => {
    expect(cleanCityName("Cumming city")).toBe("Cumming");
    expect(cleanCityName("Columbus city")).toBe("Columbus");
    expect(cleanCityName("Athens-Clarke County unified government")).toBe(
      "Athens-Clarke County",
    );
    expect(
      cleanCityName(
        "Augusta-Richmond County consolidated government (balance)",
      ),
    ).toBe("Augusta-Richmond County");
    expect(cleanCityName("Macon-Bibb County")).toBe("Macon-Bibb County");
    expect(cleanCityName("Chatham County")).toBe("Chatham County");
  });
});

describe("slugify", () => {
  it("produces clean kebab slugs", () => {
    expect(slugify("Cumming")).toBe("cumming");
    expect(slugify("Athens-Clarke County")).toBe("athens-clarke-county");
    expect(slugify("  Saint John's  ")).toBe("saint-john-s");
  });
});

describe("zoomForArea", () => {
  it("maps land area to a sane zoom, defaulting on bad input", () => {
    expect(zoomForArea(19_770_807)).toBe(14); // Cumming ~19.8 km²
    expect(zoomForArea(500_000_000)).toBe(11); // ~500 km²
    expect(zoomForArea(0)).toBe(12);
    expect(zoomForArea(Number.NaN)).toBe(12);
  });
});

describe("resolveCityCandidates", () => {
  it("returns a cleaned candidate from the places layer", async () => {
    const f = fakeFetch([["MapServer/4", cummingPlace]]);
    const res = await resolveCityCandidates(
      { name: "Cumming", state: "GA" },
      f,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    const c = res.data[0];
    expect(c).toMatchObject({
      name: "Cumming city",
      displayName: "Cumming",
      type: "place",
      geoid: "1320932",
      state: "GA",
      stateFips: "13",
    });
    expect(c.center.lat).toBeCloseTo(34.206, 2);
    expect(c.center.lng).toBeCloseTo(-84.134, 2);
  });

  it("errors on unknown state without hitting the network", async () => {
    const f = fakeFetch([]);
    const res = await resolveCityCandidates({ name: "X", state: "ZZ" }, f);
    expect(res.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("errors on empty name", async () => {
    const res = await resolveCityCandidates({ name: "  ", state: "GA" });
    expect(res.ok).toBe(false);
  });

  it("dedups the same GEOID across layers and sorts by area asc", async () => {
    const big = {
      features: [
        {
          attributes: {
            NAME: "Macon-Bibb County",
            GEOID: "GEO-COUNTY",
            INTPTLON: "-83.6",
            INTPTLAT: "32.8",
            AREALAND: "2000000000",
          },
        },
      ],
    };
    const small = {
      features: [
        {
          attributes: {
            NAME: "Macon city",
            GEOID: "GEO-CITY",
            INTPTLON: "-83.6",
            INTPTLAT: "32.8",
            AREALAND: "50000000",
          },
        },
      ],
    };
    // Same consolidated GEOID appears in both layer 3 and layer 4 → dedup to one.
    const dupA = {
      features: [
        { attributes: { NAME: "Dup gov", GEOID: "D1", AREALAND: "1" } },
      ],
    };
    const f = fakeFetch([
      ["MapServer/4", small],
      ["MapServer/3", dupA],
      ["MapServer/5", dupA],
      ["State_County/MapServer/1", big],
    ]);
    const res = await resolveCityCandidates({ name: "Macon", state: "GA" }, f);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const geoids = res.data.map((c) => c.geoid);
    expect(geoids.filter((g) => g === "D1")).toHaveLength(1); // deduped
    // smallest area first
    expect(res.data[0].geoid).toBe("D1"); // area 1
    expect(res.data[res.data.length - 1].geoid).toBe("GEO-COUNTY"); // largest
  });

  it("errors only when every layer fails", async () => {
    const f = fakeFetch([
      ["MapServer/4", "throw"],
      ["MapServer/3", "throw"],
      ["MapServer/5", "throw"],
      ["State_County/MapServer/1", "throw"],
    ]);
    const res = await resolveCityCandidates(
      { name: "Cumming", state: "GA" },
      f,
    );
    expect(res.ok).toBe(false);
  });

  it("tolerates a partial layer failure", async () => {
    const f = fakeFetch([
      ["MapServer/4", cummingPlace],
      ["MapServer/3", "throw"],
    ]);
    const res = await resolveCityCandidates(
      { name: "Cumming", state: "GA" },
      f,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
  });
});

describe("fetchCityBoundary", () => {
  const geojson = {
    features: [
      {
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          ],
        },
      },
    ],
  };

  it("returns the polygon geometry", async () => {
    const f = fakeFetch([["MapServer/4", geojson]]);
    const res = await fetchCityBoundary(
      { layerUrl: "https://x/MapServer/4", geoid: "1320932" },
      f,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.type).toBe("MultiPolygon");
  });

  it("errors when no polygon is returned", async () => {
    const f = fakeFetch([["MapServer/4", { features: [] }]]);
    const res = await fetchCityBoundary(
      { layerUrl: "https://x/MapServer/4", geoid: "nope" },
      f,
    );
    expect(res.ok).toBe(false);
  });

  it("errors on a non-OK HTTP status", async () => {
    const f = fakeFetch([["MapServer/4", "http500"]]);
    const res = await fetchCityBoundary(
      { layerUrl: "https://x/MapServer/4", geoid: "1320932" },
      f,
    );
    expect(res.ok).toBe(false);
  });
});
