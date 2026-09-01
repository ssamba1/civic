// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ==================================================================
   GET /api/open311/v2/requests/{id}

   This endpoint reported service_code "other" for EVERY request, whatever the
   report actually was.

   PostgREST shapes an embedded resource by cardinality: an array for to-many,
   a bare OBJECT for to-one. `classifications.report_id` is unique, so the
   embed arrives as an object — and the route read it as
   `row.classifications?.[0]`, which is `undefined` on an object. The
   classification came through as null and reportToOpen311 fell back to
   `other`.

   The list route had already been fixed for exactly this. This one was missed
   because `cities` (to-one, correctly unwrapped) and `classifications`
   (to-one, not) sat two lines apart, and nothing tested the endpoint.
   ================================================================== */

const CITY = { id: "city-1", name: "Cumming" };
const REPORT_ID = "949359fd-605e-41e8-a732-59489ef2cf1a";

/** The row shape PostgREST actually returns: BOTH embeds as bare objects. */
const ROW_TO_ONE = {
  id: REPORT_ID,
  city_id: CITY.id,
  location: { type: "Point", coordinates: [-84.14, 34.2] },
  photo_public_url: "https://example.com/p.webp",
  status: "open",
  address: "1 Main St",
  created_at: "2026-07-01T10:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
  classifications: {
    category: "streetlight",
    severity: 3,
    confidence: 0.9,
    reasoning: "r",
    is_emergency: false,
  },
  cities: CITY,
};

const createServerClientMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function dbReturning(row: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.single = async () => ({ data: row, error });
  return { from: () => chain };
}

async function get(row: unknown, error: unknown = null) {
  createServerClientMock.mockReturnValue(dbReturning(row, error));
  const { GET } = await import("./route");
  const req = new Request(
    `http://localhost/api/open311/v2/requests/${REPORT_ID}`,
  );
  const { NextRequest } = await import("next/server");
  // The route validates a bare UUID; the .json / .xml suffix is handled by
  // content negotiation before the param reaches here.
  return GET(new NextRequest(req), {
    params: Promise.resolve({ id: REPORT_ID }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/open311/v2/requests/{id}", () => {
  it("reads a to-ONE classification embed, which PostgREST returns as an object", async () => {
    // THE regression: `?.[0]` on this object is undefined, which silently
    // became service_code "other" for every report in the system.
    const res = await get(ROW_TO_ONE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const r = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
    expect(r.service_code).toBe("streetlight");
    expect(r.service_code).not.toBe("other");
  });

  it("still reads a to-many embed, in case a migration flips the shape back", async () => {
    const res = await get({
      ...ROW_TO_ONE,
      classifications: [ROW_TO_ONE.classifications],
      cities: [CITY],
    });
    const body = (await res.json()) as Record<string, unknown>;
    const r = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
    expect(r.service_code).toBe("streetlight");
  });

  it("falls back to `other` only when there genuinely is no classification", async () => {
    const res = await get({ ...ROW_TO_ONE, classifications: null });
    const body = (await res.json()) as Record<string, unknown>;
    const r = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
    expect(r.service_code).toBe("other");
  });

  it("404s an unknown id", async () => {
    const res = await get(null, { message: "no rows" });
    expect(res.status).toBe(404);
  });
});
