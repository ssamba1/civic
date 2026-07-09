// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedAdvisory, setCachedAdvisory } from "./cache";
import type { StormAdvisory } from "./storm-advisory";

function makeAdvisory(overrides: Partial<StormAdvisory> = {}): StormAdvisory {
  return {
    hasActiveOrRecentStorm: false,
    alerts: [],
    headlineAlert: null,
    forecastWindowHours: 48,
    overallMultiplier: 1,
    categoryBreakdown: [],
    methodologyNote: "test",
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Reset module state by clearing the cache between tests
  // setCachedAdvisory with a fresh object is not enough if TTL is still valid;
  // we need to set it with an expired time — simplest: advance time past TTL after test.
});

describe("getCachedAdvisory / setCachedAdvisory", () => {
  it("returns null before anything is cached", () => {
    // Fresh vitest isolates module state per file; but module-level vars persist
    // between tests in the same file. Advance time to expire any prior cache.
    vi.advanceTimersByTime(10 * 60_000);
    expect(getCachedAdvisory()).toBeNull();
  });

  it("returns the advisory immediately after setCachedAdvisory", () => {
    const advisory = makeAdvisory({ overallMultiplier: 3 });
    setCachedAdvisory(advisory);
    expect(getCachedAdvisory()).toBe(advisory);
  });

  it("returns the cached value within the TTL window (5 min)", () => {
    const advisory = makeAdvisory();
    setCachedAdvisory(advisory);
    vi.advanceTimersByTime(4 * 60_000 + 59_000); // 4:59
    expect(getCachedAdvisory()).toBe(advisory);
  });

  it("returns null after TTL expires (>= 5 min)", () => {
    const advisory = makeAdvisory();
    setCachedAdvisory(advisory);
    vi.advanceTimersByTime(5 * 60_000); // exactly 5 min — boundary
    expect(getCachedAdvisory()).toBeNull();
  });

  it("overwrites the previous cached value", () => {
    const a = makeAdvisory({ overallMultiplier: 1 });
    const b = makeAdvisory({ overallMultiplier: 5 });
    setCachedAdvisory(a);
    setCachedAdvisory(b);
    expect(getCachedAdvisory()).toBe(b);
  });

  it("resets the TTL when overwritten", () => {
    const a = makeAdvisory();
    const b = makeAdvisory({ overallMultiplier: 5 });
    setCachedAdvisory(a);
    vi.advanceTimersByTime(4 * 60_000); // 4 min — a still valid
    setCachedAdvisory(b); // reset clock
    vi.advanceTimersByTime(4 * 60_000); // 4 more min — b still within TTL
    expect(getCachedAdvisory()).toBe(b);
  });
});
