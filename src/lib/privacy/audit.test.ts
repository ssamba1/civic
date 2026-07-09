// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock storage state, keyed by `${bucket}/${prefix}`.
type FileEntry = { name: string; metadata: { size: number } };
const store: Record<string, FileEntry[]> = {};

vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: [
              { id: "city-clean", name: "Cleanville" },
              { id: "city-leak", name: "Leaktown" },
            ],
            error: null,
          }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) =>
          Promise.resolve({ data: store[`${bucket}/${prefix}`] ?? [], error: null }),
      }),
    },
  }),
}));

import { auditAllCities } from "./audit";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe("auditAllCities", () => {
  it("passes when no public file size-matches its raw counterpart", async () => {
    // Cleanville: blurred public (small) vs raw (large) — no match.
    store["photos-public/city-clean"] = [{ name: "a.jpg", metadata: { size: 100 } }];
    store["photos-raw/city-clean"] = [{ name: "a.jpg", metadata: { size: 900 } }];
    store["photos-public/city-leak"] = [];
    store["photos-raw/city-leak"] = [];

    const report = await auditAllCities("2026-07-09T00:00:00.000Z");
    expect(report.ok).toBe(true);
    expect(report.totalViolations).toBe(0);
    expect(report.cities).toHaveLength(2);
    expect(report.cities[0].publicScanned).toBe(1);
  });

  it("flags a city whose public file size matches the raw original", async () => {
    store["photos-public/city-clean"] = [];
    store["photos-raw/city-clean"] = [];
    // Leaktown: identical sizes -> likely raw leaked to public.
    store["photos-public/city-leak"] = [{ name: "b.jpg", metadata: { size: 500 } }];
    store["photos-raw/city-leak"] = [{ name: "b.jpg", metadata: { size: 500 } }];

    const report = await auditAllCities("2026-07-09T00:00:00.000Z");
    expect(report.ok).toBe(false);
    expect(report.totalViolations).toBe(1);
    const leak = report.cities.find((c) => c.cityId === "city-leak");
    expect(leak?.ok).toBe(false);
    expect(leak?.violations[0]).toContain("b.jpg");
  });
});
