// @vitest-environment node
import { fetchSeeClickFixReports, type SeeClickFixConfig } from "./seeclickfix";

const NOW = 1_700_000_000_000;

const cfg: SeeClickFixConfig = {
  placeUrl: "cumming-georgia",
  categoryMap: { pothole: "pothole", "street light": "streetlight" },
};

function fetchPages(pages: unknown[]): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const body = pages[call] ?? { issues: [] };
    call++;
    return { ok: true, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("fetchSeeClickFixReports", () => {
  it("maps native SeeClickFix issues to NormalizedReport", async () => {
    const f = fetchPages([
      {
        issues: [
          {
            id: 42,
            status: "Closed",
            request_type: { title: "Pothole" },
            address: "100 Main St",
            lat: 34.2,
            lng: -84.13,
            created_at: "2026-01-01T12:00:00Z",
            updated_at: "2026-01-03T09:00:00Z",
            rating: 7,
            media: { image_full: "https://x/p.jpg" },
          },
        ],
        metadata: { pagination: { next_page: null } },
      },
    ]);
    const res = await fetchSeeClickFixReports(cfg, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      source: "open311",
      sourceExternalId: "42",
      category: "pothole",
      status: "closed",
      location: { lng: -84.13, lat: 34.2 },
      address: "100 Main St",
      photoUrl: "https://x/p.jpg",
      resolvedAt: "2026-01-03T09:00:00.000Z",
    });
    // Native vote count preserved for a future upvotes backfill.
    expect((res.data[0].raw as { rating?: number }).rating).toBe(7);
  });

  it("treats Acknowledged as open, unknown type as 'other', skips bad coords", async () => {
    const f = fetchPages([
      {
        issues: [
          {
            id: 1,
            status: "Acknowledged",
            request_type: { title: "Weeds" },
            lat: 34.2,
            lng: -84.1,
          },
          {
            id: 2,
            status: "Open",
            request_type: { title: "Pothole" },
            lat: "nope",
            lng: "x",
          },
        ],
        metadata: { pagination: { next_page: null } },
      },
    ]);
    const res = await fetchSeeClickFixReports(cfg, f, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].category).toBe("other");
    expect(res.data[0].status).toBe("open");
  });

  it("paginates via metadata.next_page until exhausted", async () => {
    const f = fetchPages([
      {
        issues: [
          {
            id: 1,
            status: "Open",
            request_type: { title: "Pothole" },
            lat: 34.2,
            lng: -84.1,
          },
        ],
        metadata: { pagination: { next_page: 2 } },
      },
      {
        issues: [
          {
            id: 2,
            status: "Open",
            request_type: { title: "Pothole" },
            lat: 34.3,
            lng: -84.2,
          },
        ],
        metadata: { pagination: { next_page: null } },
      },
    ]);
    const res = await fetchSeeClickFixReports(cfg, f, NOW);
    expect(res.ok && res.data).toHaveLength(2);
  });

  it("errors on non-OK HTTP", async () => {
    const f = vi.fn(async () => ({
      ok: false,
      status: 503,
    })) as unknown as typeof fetch;
    const res = await fetchSeeClickFixReports(cfg, f, NOW);
    expect(res.ok).toBe(false);
  });
});
