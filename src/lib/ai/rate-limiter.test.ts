// @vitest-environment node
// Tests for checkAndRecordGeminiCall and getGeminiRateLimitStats.
//
// The module uses module-level mutable timestamp arrays — state persists across
// imports unless we reset the module cache. We use vi.isolateModules() inside
// each test to get a fresh module instance, so tests are fully independent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-15T12:00:00Z")); // stable baseline per test
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules(); // clear module cache so next test gets fresh state
});

// Load a fresh copy of the module inside each test via isolateModules.
async function freshLimiter() {
  return vi.importActual<typeof import("./rate-limiter")>("./rate-limiter");
}

describe("checkAndRecordGeminiCall — basic allow/deny", () => {
  it("allows the first call", async () => {
    const { checkAndRecordGeminiCall } = await freshLimiter();
    expect(checkAndRecordGeminiCall().allowed).toBe(true);
  });

  it("records the call (stats increase by 1)", async () => {
    const { checkAndRecordGeminiCall, getGeminiRateLimitStats } =
      await freshLimiter();
    checkAndRecordGeminiCall();
    expect(getGeminiRateLimitStats().callsLastMinute).toBe(1);
  });
});

describe("checkAndRecordGeminiCall — per-minute limit", () => {
  it("blocks at rpm limit", async () => {
    process.env.GEMINI_RPM = "3";
    process.env.GEMINI_RPH = "1000";
    process.env.GEMINI_RPD = "10000";

    const { checkAndRecordGeminiCall } = await freshLimiter();
    const r1 = checkAndRecordGeminiCall();
    const r2 = checkAndRecordGeminiCall();
    const r3 = checkAndRecordGeminiCall();
    const r4 = checkAndRecordGeminiCall();

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.reason).toMatch(/per-minute/);
    expect(r4.retryAfterMs).toBeGreaterThan(0);

    delete process.env.GEMINI_RPM;
    delete process.env.GEMINI_RPH;
    delete process.env.GEMINI_RPD;
  });

  it("allows calls again after the minute window resets", async () => {
    process.env.GEMINI_RPM = "2";
    process.env.GEMINI_RPH = "1000";
    process.env.GEMINI_RPD = "10000";

    const { checkAndRecordGeminiCall } = await freshLimiter();
    checkAndRecordGeminiCall();
    checkAndRecordGeminiCall();
    expect(checkAndRecordGeminiCall().allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkAndRecordGeminiCall().allowed).toBe(true);

    delete process.env.GEMINI_RPM;
    delete process.env.GEMINI_RPH;
    delete process.env.GEMINI_RPD;
  });
});

describe("checkAndRecordGeminiCall — per-hour limit", () => {
  it("blocks at rph limit", async () => {
    process.env.GEMINI_RPM = "1000";
    process.env.GEMINI_RPH = "2";
    process.env.GEMINI_RPD = "10000";

    const { checkAndRecordGeminiCall } = await freshLimiter();
    checkAndRecordGeminiCall();
    vi.advanceTimersByTime(61_000); // past minute window
    checkAndRecordGeminiCall();
    vi.advanceTimersByTime(61_000);
    const r = checkAndRecordGeminiCall();

    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/per-hour/);

    delete process.env.GEMINI_RPM;
    delete process.env.GEMINI_RPH;
    delete process.env.GEMINI_RPD;
  });
});

describe("checkAndRecordGeminiCall — per-day limit", () => {
  it("blocks at rpd limit", async () => {
    process.env.GEMINI_RPM = "10000";
    process.env.GEMINI_RPH = "10000";
    process.env.GEMINI_RPD = "2";

    const { checkAndRecordGeminiCall } = await freshLimiter();
    checkAndRecordGeminiCall();
    checkAndRecordGeminiCall();
    const r = checkAndRecordGeminiCall();

    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/daily/);

    delete process.env.GEMINI_RPM;
    delete process.env.GEMINI_RPH;
    delete process.env.GEMINI_RPD;
  });
});

describe("getGeminiRateLimitStats", () => {
  it("returns zero counts on fresh module", async () => {
    const { getGeminiRateLimitStats } = await freshLimiter();
    const stats = getGeminiRateLimitStats();
    expect(stats.callsLastMinute).toBe(0);
    expect(stats.callsLastHour).toBe(0);
    expect(stats.callsLastDay).toBe(0);
  });

  it("reflects the configured limits from env", async () => {
    process.env.GEMINI_RPM = "99";
    process.env.GEMINI_RPH = "500";
    process.env.GEMINI_RPD = "2000";

    const { getGeminiRateLimitStats } = await freshLimiter();
    const stats = getGeminiRateLimitStats();
    expect(stats.limitPerMinute).toBe(99);
    expect(stats.limitPerHour).toBe(500);
    expect(stats.limitPerDay).toBe(2000);

    delete process.env.GEMINI_RPM;
    delete process.env.GEMINI_RPH;
    delete process.env.GEMINI_RPD;
  });

  it("prunes expired timestamps before reporting", async () => {
    process.env.GEMINI_RPM = "1000";
    process.env.GEMINI_RPH = "1000";
    process.env.GEMINI_RPD = "1000";

    const { checkAndRecordGeminiCall, getGeminiRateLimitStats } =
      await freshLimiter();

    checkAndRecordGeminiCall();
    expect(getGeminiRateLimitStats().callsLastMinute).toBe(1);

    vi.advanceTimersByTime(61_000);
    expect(getGeminiRateLimitStats().callsLastMinute).toBe(0);
    expect(getGeminiRateLimitStats().callsLastHour).toBe(1);

    delete process.env.GEMINI_RPM;
    delete process.env.GEMINI_RPH;
    delete process.env.GEMINI_RPD;
  });
});
