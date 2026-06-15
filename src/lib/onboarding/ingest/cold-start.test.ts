// @vitest-environment node
import type { BoundaryGeometry } from "@/lib/onboarding/tiger";
import type { ArcGisConfig } from "./arcgis";
import { coldStart } from "./cold-start";

const NOW = 1_700_000_000_000;
const BASE = "https://proj.supabase.co";

const square: BoundaryGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ],
  ],
};

const arcgisCfg: ArcGisConfig = {
  url: "https://services.arcgis.com/x/FeatureServer/0",
  categoryField: "cat",
  categoryMap: { pothole: "pothole" },
};

// Recording supabase stub (reused shape from writer.test).
function makeDb() {
  const inserts: Record<string, Record<string, unknown>[]> = {};
  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      if (!inserts[table]) inserts[table] = [];
      inserts[table].push(...rows);
      return { error: null };
    }),
    update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  }));
  // biome-ignore lint/suspicious/noExplicitAny: structural supabase stub
  return { db: { from } as any, inserts };
}

function arcgisFetch(features: Record<string, unknown>[]): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ features, exceededTransferLimit: false }),
  })) as unknown as typeof fetch;
}

describe("coldStart", () => {
  it("uses ArcGIS data when the source returns rows", async () => {
    const { db, inserts } = makeDb();
    const fetchImpl = arcgisFetch([
      { attributes: { cat: "Pothole" }, geometry: { x: -84.1, y: 34.2 } },
    ]);

    const res = await coldStart(
      { cityId: "c1", boundary: square, arcgis: arcgisCfg },
      { db, fetchImpl, now: NOW, photoBaseUrl: BASE },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.source).toBe("arcgis");
    expect(res.data.inserted).toBe(1);
    expect(res.data.degraded).toBeUndefined();
    expect(inserts.reports[0].source).toBe("arcgis");
  });

  it("falls back to synthetic (degraded) when ArcGIS returns no rows", async () => {
    const { db, inserts } = makeDb();
    const res = await coldStart(
      {
        cityId: "c1",
        boundary: square,
        arcgis: arcgisCfg,
        syntheticCount: 30,
        seed: 4,
      },
      { db, fetchImpl: arcgisFetch([]), now: NOW, photoBaseUrl: BASE },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.source).toBe("synthetic");
    expect(res.data.inserted).toBe(30);
    expect(res.data.degraded).toMatch(/no rows/);
    expect(inserts.reports.every((r) => r.source === "synthetic")).toBe(true);
  });

  it("falls back to synthetic (degraded) when ArcGIS errors", async () => {
    const { db } = makeDb();
    const failing = vi.fn(async () => ({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;
    const res = await coldStart(
      { cityId: "c1", boundary: square, arcgis: arcgisCfg, syntheticCount: 10 },
      { db, fetchImpl: failing, now: NOW, photoBaseUrl: BASE },
    );
    expect(res.ok && res.data.source).toBe("synthetic");
    expect(res.ok && res.data.degraded).toMatch(/failed/);
  });

  it("generates synthetic directly when no ArcGIS config is given", async () => {
    const { db } = makeDb();
    const res = await coldStart(
      { cityId: "c1", boundary: square, syntheticCount: 25, seed: 1 },
      { db, now: NOW, photoBaseUrl: BASE },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.source).toBe("synthetic");
    expect(res.data.inserted).toBe(25);
  });
});
