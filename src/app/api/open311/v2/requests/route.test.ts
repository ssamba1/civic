// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ==================================================================
   POST /api/open311/v2/requests

   This file exists because its absence was the bug. The endpoint answered
   500 to every well-formed, authenticated request — reports.photo_public_url
   is NOT NULL and the route inserted null into it — and nothing noticed,
   because no test had ever posted a service request. Type-check, lint, the
   whole unit suite, the e2e specs and the production build were all green
   while the inbound half of Open311 conformance was completely dead.

   The e2e suite does cover this endpoint, but only that an anonymous POST is
   rejected. A 401 path never reaches the insert.
   ================================================================== */

const CITY = {
  id: "city-1",
  slug: "cumming",
  name: "Cumming",
  state: "GA",
  active: true,
  open311_jurisdiction_id: "cumming.ga.gov",
};

const lookupApiKeyMock = vi.hoisted(() => vi.fn());
const runClassifyPipelineMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true as const, data: {} })),
);
const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/open311/api-keys", () => ({ lookupApiKey: lookupApiKeyMock }));
vi.mock("@/lib/ai/classify-pipeline", () => ({
  runClassifyPipeline: runClassifyPipelineMock,
}));
vi.mock("@/lib/db/client", () => ({
  createServerClient: createServerClientMock,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    correlationId: "test",
  }),
}));
// `after()` defers work past the response; run it inline so the test does not
// depend on Next's request lifecycle.
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

/** Captures whatever the route inserts into `reports`. */
let insertedReport: Record<string, unknown> | null = null;

function makeDb() {
  return {
    from(table: string) {
      if (table === "cities") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit"]) {
          chain[m] = () => chain;
        }
        chain.single = async () => ({ data: CITY, error: null });
        return chain;
      }
      if (table === "reports") {
        return {
          insert(payload: Record<string, unknown>) {
            insertedReport = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "report-1", ...payload },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      // error_log and anything else the route touches best-effort.
      return { insert: async () => ({ error: null }) };
    },
  };
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  const req = new Request("http://localhost/api/open311/v2/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // The handler reads request.nextUrl; NextRequest wraps a plain Request.
  const { NextRequest } = await import("next/server");
  return POST(new NextRequest(req));
}

const VALID = {
  api_key: "test-key",
  service_code: "pothole",
  lat: "34.2073",
  long: "-84.1402",
  address_string: "1 Main St",
  description: "A pothole",
};

beforeEach(() => {
  insertedReport = null;
  vi.clearAllMocks();
  createServerClientMock.mockReturnValue(makeDb());
  lookupApiKeyMock.mockResolvedValue({
    id: "key-1",
    label: "partner",
    userId: "user-1",
    cityId: CITY.id,
    scopes: ["open311:read", "open311:write"],
  });
});

describe("POST /api/open311/v2/requests", () => {
  it("creates a service request and returns 201 with a GeoReport v2 body", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    const json = (await res.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].service_request_id).toBe("report-1");
    expect(json[0].token).toBe("report-1");
  });

  it("never writes a null photo_public_url", async () => {
    // THE regression. reports.photo_public_url is NOT NULL, so a null here is
    // a 23502 at insert time and a 500 to the caller — for every request, not
    // an edge case. A caller's media_url is deliberately not stored (it is
    // neither blur-verified nor ours), which is correct and is exactly what
    // left this column with nothing to write.
    await post(VALID);
    expect(insertedReport).not.toBeNull();
    expect(insertedReport?.photo_public_url).toEqual(expect.any(String));
    expect(String(insertedReport?.photo_public_url).length).toBeGreaterThan(0);
  });

  it("does not store a caller-supplied media_url", async () => {
    // Storing it would let any open311:write key holder put an arbitrary
    // remote image — unblurred faces, or a tracking pixel — on the city's
    // public map, echoed back as media_url in every subsequent GET.
    const evil = "https://evil.example/tracker.png";
    await post({ ...VALID, media_url: evil });
    expect(JSON.stringify(insertedReport)).not.toContain("evil.example");
    expect(insertedReport?.photo_raw_url).toBeNull();
  });

  it("rejects a media_url that is not https", async () => {
    const res = await post({
      ...VALID,
      media_url: "http://insecure.example/a.png",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a key without the open311:write scope with 403, not 401", async () => {
    lookupApiKeyMock.mockResolvedValue({
      id: "key-2",
      label: "read-only",
      userId: "user-1",
      cityId: CITY.id,
      scopes: ["open311:read"],
    });
    const res = await post(VALID);
    expect(res.status).toBe(403);
  });

  it("rejects a missing api_key with 401", async () => {
    const { api_key: _drop, ...noKey } = VALID;
    lookupApiKeyMock.mockResolvedValue(null);
    const res = await post(noKey);
    expect(res.status).toBe(401);
  });

  it("rejects an unknown service_code with 400", async () => {
    const res = await post({ ...VALID, service_code: "not_a_service" });
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric coordinates with 400", async () => {
    const res = await post({ ...VALID, lat: "north", long: "west" });
    expect(res.status).toBe(400);
  });

  it("triggers classification for the created report", async () => {
    await post(VALID);
    expect(runClassifyPipelineMock).toHaveBeenCalledWith("report-1");
  });
});
