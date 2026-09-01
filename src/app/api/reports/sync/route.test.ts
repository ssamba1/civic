import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthUser, submitReport } = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  submitReport: vi.fn(),
}));

vi.mock("@/app/report/actions", () => ({ submitReport }));
vi.mock("@/lib/db/ssr-client", () => ({ getAuthUser }));
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
  clientIp: () => "test",
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const queuedReport = {
  id: "a4ca4089-6e56-4d25-847f-74e5b7e94e8a",
  photosBlurred: ["blurred"],
  photosOriginal: ["original"],
  location: { lat: 31.39, lng: -81.26 },
  address: null,
  description: "Flooded road",
  tags: [],
  occurredAt: "2026-08-31T12:00:00.000Z",
};

function request(authorization?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://localhost/api/reports/sync", {
    method: "POST",
    headers,
    body: JSON.stringify(queuedReport),
  });
}

describe("POST /api/reports/sync authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthUser.mockResolvedValue(null);
  });

  it("forwards a native bearer token to the shared submission pipeline", async () => {
    submitReport.mockResolvedValue({
      ok: true,
      data: { id: queuedReport.id, classification: {} },
    });
    const { POST } = await import("./route");

    const response = await POST(request("bearer native-access-token"));

    expect(response.status).toBe(200);
    expect(getAuthUser).not.toHaveBeenCalled();
    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: queuedReport.id,
        occurredAt: queuedReport.occurredAt,
        authToken: "native-access-token",
      }),
    );
  });

  it("returns 401 when the shared pipeline rejects an expired bearer token", async () => {
    submitReport.mockResolvedValue({ ok: false, error: "unauthenticated" });
    const { POST } = await import("./route");

    const response = await POST(request("Bearer expired-token"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it("requires cookie authentication when no bearer token is present", async () => {
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("keeps an idempotency owner conflict as a non-success response", async () => {
    submitReport.mockResolvedValue({
      ok: false,
      error: "idempotency_key_conflict",
    });
    const { POST } = await import("./route");

    const response = await POST(request("Bearer native-access-token"));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: "idempotency_key_conflict",
    });
  });
});
