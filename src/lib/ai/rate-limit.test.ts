// @vitest-environment node

import { AI_RATE_LIMIT } from "./config";
import { checkRateLimit, clientIp } from "./rate-limit";

// Build a minimal Request with arbitrary headers (Request is global in the
// node test environment via undici).
function reqWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://example.test/api", { headers });
}

// Unique key per call so the module-level `windows` Map never leaks state
// between independent test cases.
let keyCounter = 0;
function freshKey(label: string): string {
  keyCounter += 1;
  return `${label}-${keyCounter}`;
}

describe("clientIp", () => {
  it("prefers x-real-ip over x-forwarded-for (XFF first entry is spoofable)", () => {
    const req = reqWithHeaders({
      "x-forwarded-for": "  203.0.113.7 , 70.41.3.18, 150.172.238.178",
      "x-real-ip": "10.0.0.1",
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });

  it("uses the LAST x-forwarded-for entry when no platform header is set", () => {
    const req = reqWithHeaders({
      "x-forwarded-for": "  203.0.113.7 , 70.41.3.18, 150.172.238.178  ",
    });
    expect(clientIp(req)).toBe("150.172.238.178");
  });

  it("handles a single-value x-forwarded-for", () => {
    const req = reqWithHeaders({ "x-forwarded-for": "198.51.100.5" });
    expect(clientIp(req)).toBe("198.51.100.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = reqWithHeaders({ "x-real-ip": "  192.0.2.44  " });
    expect(clientIp(req)).toBe("192.0.2.44");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    const req = reqWithHeaders({});
    expect(clientIp(req)).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to `max` requests in a window, then blocks with retryAfterMs > 0", () => {
    const key = freshKey("allow-then-block");
    const cfg = { windowMs: 10_000, max: 3 };

    for (let i = 0; i < cfg.max; i += 1) {
      const res = checkRateLimit(key, cfg);
      expect(res.allowed).toBe(true);
      expect(res.retryAfterMs).toBe(0);
    }

    const blocked = checkRateLimit(key, cfg);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(cfg.windowMs);
  });

  it("uses AI_RATE_LIMIT defaults when no config is supplied", () => {
    const key = freshKey("defaults");

    for (let i = 0; i < AI_RATE_LIMIT.max; i += 1) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }

    const blocked = checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(AI_RATE_LIMIT.windowMs);
  });

  it("allows again after the window resets (fake timers advance past windowMs)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const key = freshKey("window-reset");
    const cfg = { windowMs: 5_000, max: 2 };

    // Exhaust the window.
    expect(checkRateLimit(key, cfg).allowed).toBe(true);
    expect(checkRateLimit(key, cfg).allowed).toBe(true);
    expect(checkRateLimit(key, cfg).allowed).toBe(false);

    // Still inside the window. Stays blocked.
    vi.advanceTimersByTime(cfg.windowMs - 1);
    expect(checkRateLimit(key, cfg).allowed).toBe(false);

    // Cross the reset boundary (now >= resetAt), fresh window allows again.
    vi.advanceTimersByTime(2);
    const reopened = checkRateLimit(key, cfg);
    expect(reopened.allowed).toBe(true);
    expect(reopened.retryAfterMs).toBe(0);
  });

  it("reports a decreasing retryAfterMs as the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const key = freshKey("retry-countdown");
    const cfg = { windowMs: 10_000, max: 1 };

    expect(checkRateLimit(key, cfg).allowed).toBe(true);

    const first = checkRateLimit(key, cfg);
    expect(first.allowed).toBe(false);
    expect(first.retryAfterMs).toBe(cfg.windowMs);

    vi.advanceTimersByTime(4_000);
    const later = checkRateLimit(key, cfg);
    expect(later.allowed).toBe(false);
    expect(later.retryAfterMs).toBe(cfg.windowMs - 4_000);
  });

  it("tracks distinct keys independently", () => {
    const keyA = freshKey("independent-a");
    const keyB = freshKey("independent-b");
    const cfg = { windowMs: 10_000, max: 1 };

    // Exhaust key A.
    expect(checkRateLimit(keyA, cfg).allowed).toBe(true);
    expect(checkRateLimit(keyA, cfg).allowed).toBe(false);

    // Key B has its own fresh window.
    expect(checkRateLimit(keyB, cfg).allowed).toBe(true);
    expect(checkRateLimit(keyB, cfg).allowed).toBe(false);
  });
});
