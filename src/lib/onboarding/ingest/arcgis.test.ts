// @vitest-environment node
import { type ArcGisConfig, fetchArcGisReports } from "./arcgis";

const NOW = 1_700_000_000_000;

const cfg: ArcGisConfig = {
  url: "https://services.arcgis.com/x/FeatureServer/0",
  categoryField: "Category_ID",
  categoryMap: { pothole: "pothole", "street light": "streetlight" },
  statusField: "Status",
  statusMap: { open: "open", closed: "closed", "in progress": "in_progress" },
  dateField: "InitiateDate",
  idField: "Incident_ID",
  addressField: "WOAddress",
  severityField: "Priority",
};

// esri feature with geometry already in 4326 (we request outSR=4326).
function feature(attrs: Record<string, unknown>, x = -84.13, y = 34.2) {
  return { attributes: attrs, geometry: { x, y } };
}

function fetchOnce(payload: unknown): typeof fetch {
  return vi.fn(
    async () => ({ ok: true, json: async () => payload }) as Response,
  ) as unknown as typeof fetch;
}

describe("fetchArcGisReports", () => {
  it("maps esri features to NormalizedReport with field/value mapping", async () => {
    const f = fetchOnce({
      features: [
        feature({
          Category_ID: "Pothole",
          Status: "Closed",
          InitiateDate: NOW - 86_400_000,
          Incident_ID: "INC-1",
          WOAddress: "123 Main St",
          Priority: 4,
        }),
      ],
      exceededTransferLimit: false,
    });

    const res = await fetchArcGisReports(cfg, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      source: "arcgis",
      sourceExternalId: "INC-1",
      category: "pothole",
      status: "closed",
      severity: 4,
      address: "123 Main St",
      location: { lng: -84.13, lat: 34.2 },
    });
    expect(res.data[0].createdAt).toBe(
      new Date(NOW - 86_400_000).toISOString(),
    );
  });

  it("defaults unknown category to 'other' and missing status to 'open'", async () => {
    const f = fetchOnce({
      features: [feature({ Category_ID: "Mystery", Status: "weird" })],
      exceededTransferLimit: false,
    });
    const res = await fetchArcGisReports(cfg, f, NOW);
    expect(res.ok && res.data[0].category).toBe("other");
    expect(res.ok && res.data[0].status).toBe("open");
  });

  it("skips features without point geometry", async () => {
    const f = fetchOnce({
      features: [{ attributes: { Category_ID: "Pothole" }, geometry: null }],
      exceededTransferLimit: false,
    });
    const res = await fetchArcGisReports(cfg, f, NOW);
    expect(res.ok && res.data).toHaveLength(0);
  });

  it("unprojects Web-Mercator metres when a layer ignores outSR", async () => {
    // -84.13,34.2 in EPSG:3857 metres (approx).
    const f = fetchOnce({
      features: [feature({ Category_ID: "Pothole" }, -9365959, 4060490)],
      exceededTransferLimit: false,
    });
    const res = await fetchArcGisReports(cfg, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // approximate input metres → within ~0.5° of the intended lng/lat
    expect(res.data[0].location.lng).toBeCloseTo(-84.13, 0);
    expect(res.data[0].location.lat).toBeCloseTo(34.2, 0);
  });

  it("paginates while exceededTransferLimit and stops on a short page", async () => {
    let call = 0;
    const f = vi.fn(async () => {
      call++;
      if (call === 1) {
        return {
          ok: true,
          json: async () => ({
            features: Array.from({ length: 2 }, (_, i) =>
              feature({ Category_ID: "Pothole", Incident_ID: `a${i}` }),
            ),
            exceededTransferLimit: true,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          features: [feature({ Category_ID: "Pothole", Incident_ID: "b0" })],
          exceededTransferLimit: false,
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const res = await fetchArcGisReports({ ...cfg, pageSize: 2 }, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(3);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("returns an error on non-OK HTTP", async () => {
    const f = vi.fn(
      async () => ({ ok: false, status: 503 }) as Response,
    ) as unknown as typeof fetch;
    const res = await fetchArcGisReports(cfg, f, NOW);
    expect(res.ok).toBe(false);
  });
});
