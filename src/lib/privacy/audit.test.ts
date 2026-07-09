// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock storage state, keyed by `${bucket}/${prefix}`.
type FileEntry = { name: string; metadata: { size: number } };
const store: Record<string, FileEntry[]> = {};

// Per-city blur counts: [total, withVersion]. Defaults keep coverage at 0.
const blurCounts: Record<string, [number, number]> = {};
let currentCity = "";

vi.mock("@/lib/db/client", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "cities") {
        return {
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
        };
      }
      // reports count query: select('*',{count,head}).eq(city).[.not(...)]
      // Awaiting the base (eq only) yields total; awaiting after .not yields
      // withVersion. A `notted` flag on the builder distinguishes them.
      const makeBuilder = (notted: boolean) => {
        const b: Record<string, unknown> = {};
        b.eq = (_c: string, v: string) => {
          currentCity = v;
          return b;
        };
        b.not = () => makeBuilder(true);
        b.then = (resolve: (v: unknown) => unknown) => {
          const [total, withV] = blurCounts[currentCity] ?? [0, 0];
          return resolve({ count: notted ? withV : total, error: null });
        };
        return b;
      };
      return { select: () => makeBuilder(false) };
    },
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) =>
          Promise.resolve({
            data: store[`${bucket}/${prefix}`] ?? [],
            error: null,
          }),
      }),
    },
  }),
}));

import { auditAllCities } from "./audit";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(blurCounts)) delete blurCounts[k];
});

describe("auditAllCities", () => {
  it("passes when no public file size-matches its raw counterpart", async () => {
    // Cleanville: blurred public (small) vs raw (large) — no match.
    store["photos-public/city-clean"] = [
      { name: "a.jpg", metadata: { size: 100 } },
    ];
    store["photos-raw/city-clean"] = [
      { name: "a.jpg", metadata: { size: 900 } },
    ];
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
    store["photos-public/city-leak"] = [
      { name: "b.jpg", metadata: { size: 500 } },
    ];
    store["photos-raw/city-leak"] = [
      { name: "b.jpg", metadata: { size: 500 } },
    ];

    const report = await auditAllCities("2026-07-09T00:00:00.000Z");
    expect(report.ok).toBe(false);
    expect(report.totalViolations).toBe(1);
    const leak = report.cities.find((c) => c.cityId === "city-leak");
    expect(leak?.ok).toBe(false);
    expect(leak?.violations[0]).toContain("b.jpg");
  });

  it("computes blur coverage per city (withVersion / total)", async () => {
    blurCounts["city-clean"] = [10, 9]; // 90%
    blurCounts["city-leak"] = [0, 0]; // no reports -> 0%
    const report = await auditAllCities("2026-07-09T00:00:00.000Z");
    const clean = report.cities.find((c) => c.cityId === "city-clean");
    expect(clean?.blurCoverage).toEqual({
      withVersion: 9,
      total: 10,
      pct: 90,
    });
    const leak = report.cities.find((c) => c.cityId === "city-leak");
    expect(leak?.blurCoverage.pct).toBe(0);
  });
});
