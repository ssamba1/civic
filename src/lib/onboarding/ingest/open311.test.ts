// @vitest-environment node
import { fetchOpen311Reports, type Open311Config } from "./open311";

const NOW = 1_700_000_000_000;

const cfg: Open311Config = {
  url: "https://city.gov/open311/v2",
  categoryMap: { pothole: "pothole", "street-light": "streetlight" },
};

function fetchPages(pages: unknown[][]): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const body = pages[call] ?? [];
    call++;
    return { ok: true, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("fetchOpen311Reports", () => {
  it("maps GeoReport requests to NormalizedReport", async () => {
    const f = fetchPages([
      [
        {
          service_request_id: "638344",
          service_code: "pothole",
          status: "closed",
          requested_datetime: "2026-01-01T12:00:00Z",
          updated_datetime: "2026-01-03T09:00:00Z",
          address: "100 Main St",
          lat: 34.2,
          long: -84.13,
          media_url: "https://x/p.jpg",
        },
      ],
    ]);
    const res = await fetchOpen311Reports(cfg, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      source: "open311",
      sourceExternalId: "638344",
      category: "pothole",
      status: "closed",
      location: { lng: -84.13, lat: 34.2 },
      address: "100 Main St",
      photoUrl: "https://x/p.jpg",
      resolvedAt: "2026-01-03T09:00:00.000Z",
    });
  });

  it("defaults unknown service to 'other' and open status; skips bad coords", async () => {
    const f = fetchPages([
      [
        { service_code: "mystery", lat: 34.2, long: -84.1 },
        { service_code: "pothole", lat: "nope", long: "x" },
      ],
    ]);
    const res = await fetchOpen311Reports(cfg, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].category).toBe("other");
    expect(res.data[0].status).toBe("open");
  });

  it("paginates until a short page", async () => {
    const full = Array.from({ length: 2 }, (_, i) => ({
      service_request_id: i,
      service_code: "pothole",
      lat: 34.2,
      long: -84.1,
    }));
    const f = fetchPages([
      full,
      [
        {
          service_request_id: 9,
          service_code: "pothole",
          lat: 34.2,
          long: -84.1,
        },
      ],
    ]);
    const res = await fetchOpen311Reports({ ...cfg, pageSize: 2 }, f, NOW);
    expect(res.ok && res.data).toHaveLength(3);
  });

  it("errors on non-OK HTTP", async () => {
    const f = vi.fn(async () => ({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;
    const res = await fetchOpen311Reports(cfg, f, NOW);
    expect(res.ok).toBe(false);
  });
});
