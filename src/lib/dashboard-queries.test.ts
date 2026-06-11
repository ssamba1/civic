import { beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside an RSC environment; neutralize for unit tests.
vi.mock("server-only", () => ({}));

// React's cache() needs a request scope in RSC; identity passthrough is enough here.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn() }),
}));

// Simulate the postgrest-js failure mode behind this regression: a truncated
// response body makes its unguarded JSON.parse throw, so the awaited query
// REJECTS instead of resolving to `{ data, error }`.
const parseFailure = new SyntaxError("Unexpected end of JSON input");

const rejectingBuilder = () => {
  const p = Promise.reject(parseFailure);
  // Prevent unhandled-rejection noise when a chain method is never awaited.
  p.catch(() => {});
  return new Proxy(p, {
    get(target, prop: string | symbol) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        const fn = target[prop as "then"];
        return fn.bind(target);
      }
      return () => rejectingBuilder();
    },
  });
};

vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({
    from: () => rejectingBuilder(),
    rpc: () => rejectingBuilder(),
  }),
}));

import {
  fetchCategoryBreakdown,
  fetchCity,
  fetchCityStats,
  fetchRecentReports,
  fetchReportMarkers,
} from "./dashboard-queries";

describe("dashboard-queries no-throw contract (thrown exceptions, not error objects)", () => {
  beforeEach(() => logError.mockClear());

  it("fetchCityStats returns zeroed stats instead of 500ing the page", async () => {
    await expect(fetchCityStats("city-1")).resolves.toEqual({
      total: 0,
      open: 0,
      resolved: 0,
      avg_resolution_hours: 0,
      this_week: 0,
      prev_week: 0,
    });
    expect(logError).toHaveBeenCalled();
  });

  it("fetchCity returns null", async () => {
    await expect(fetchCity("cumming")).resolves.toBeNull();
  });

  it("fetchCategoryBreakdown returns []", async () => {
    await expect(fetchCategoryBreakdown("city-1")).resolves.toEqual([]);
  });

  it("fetchRecentReports returns []", async () => {
    await expect(fetchRecentReports("city-1")).resolves.toEqual([]);
  });

  it("fetchReportMarkers returns []", async () => {
    await expect(fetchReportMarkers()).resolves.toEqual([]);
  });
});
