import { afterEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside an RSC environment; neutralize for unit tests.
vi.mock("server-only", () => ({}));

const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: logError, warn: vi.fn(), info: logInfo }),
}));

import { deliverEmail } from "./deliver";

const baseMsg = {
  to: "resident@example.com",
  subject: "Your pothole report was resolved",
  heading: "Resolved",
  body: "Pothole filled.",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("deliverEmail", () => {
  it("no-ops with no recipient (anonymous reporter) and never calls fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await deliverEmail({ ...baseMsg, to: null });

    expect(res).toEqual({ sent: false, reason: "no-recipient" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("short-circuits to 'disabled' when NOTIFY_DISABLE=1, even with a key", async () => {
    vi.stubEnv("NOTIFY_DISABLE", "1");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await deliverEmail(baseMsg);

    expect(res.reason).toBe("disabled");
    expect(res.sent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 'no-key' (log-only demo path) when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("NOTIFY_DISABLE", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await deliverEmail(baseMsg);

    expect(res.reason).toBe("no-key");
    expect(res.sent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to Resend and reports sent when a key is configured", async () => {
    vi.stubEnv("NOTIFY_DISABLE", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "Civic <notify@civic.test>");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await deliverEmail({
      ...baseMsg,
      photoUrl: "https://x/after.jpg",
    });

    expect(res).toEqual({ sent: true, reason: "ok" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const payload = JSON.parse(init.body);
    expect(payload.to).toBe(baseMsg.to);
    expect(payload.from).toBe("Civic <notify@civic.test>");
    // The resolution photo (the lever) is embedded in the HTML body.
    expect(payload.html).toContain("https://x/after.jpg");
  });

  it("reports send-error on a non-2xx Resend response", async () => {
    vi.stubEnv("NOTIFY_DISABLE", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );

    const res = await deliverEmail(baseMsg);

    expect(res).toEqual({ sent: false, reason: "send-error" });
  });

  it("never throws when fetch itself rejects (network drop)", async () => {
    vi.stubEnv("NOTIFY_DISABLE", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );

    const res = await deliverEmail(baseMsg);

    expect(res).toEqual({ sent: false, reason: "send-error" });
  });

  it("escapes HTML in user-influenced fields (no markup injection)", async () => {
    vi.stubEnv("NOTIFY_DISABLE", "");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await deliverEmail({ ...baseMsg, body: "<script>alert(1)</script>" });

    const [, init] = fetchSpy.mock.calls[0] as unknown as [
      unknown,
      { body: string },
    ];
    const payload = JSON.parse(init.body);
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
  });
});
