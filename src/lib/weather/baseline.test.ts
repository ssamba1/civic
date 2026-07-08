// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// Stub DB client
function stubClient(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    gte: () => Promise.resolve(result),
  };
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  return { from: vi.fn(() => chain) } as any;
}

vi.mock("@/lib/db/client", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@/lib/db/client";
import { BASELINE_LOOKBACK_DAYS } from "./storm-config";
import { getCategoryDailyBaseline } from "./baseline";

describe("getCategoryDailyBaseline", () => {
  it("returns empty map on DB error", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient({ data: null, error: { message: "no such table" } }),
    );
    const result = await getCategoryDailyBaseline();
    expect(result).toEqual({});
  });

  it("returns empty map when data is null with no error", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient({ data: null, error: null }),
    );
    const result = await getCategoryDailyBaseline();
    expect(result).toEqual({});
  });

  it("aggregates counts and divides by BASELINE_LOOKBACK_DAYS", async () => {
    const rows = [
      { category: "pothole" },
      { category: "pothole" },
      { category: "pothole" },
      { category: "drainage" },
    ];
    vi.mocked(createServerClient).mockReturnValue(
      stubClient({ data: rows, error: null }),
    );
    const result = await getCategoryDailyBaseline();
    expect(result.pothole).toBeCloseTo(3 / BASELINE_LOOKBACK_DAYS);
    expect(result.drainage).toBeCloseTo(1 / BASELINE_LOOKBACK_DAYS);
  });

  it("returns only categories present in data", async () => {
    const rows = [{ category: "graffiti" }];
    vi.mocked(createServerClient).mockReturnValue(
      stubClient({ data: rows, error: null }),
    );
    const result = await getCategoryDailyBaseline();
    expect(Object.keys(result)).toEqual(["graffiti"]);
    expect(result.graffiti).toBeCloseTo(1 / BASELINE_LOOKBACK_DAYS);
  });

  it("handles empty data array", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      stubClient({ data: [], error: null }),
    );
    const result = await getCategoryDailyBaseline();
    expect(result).toEqual({});
  });
});
