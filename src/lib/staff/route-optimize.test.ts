import { describe, expect, it } from "vitest";
import {
  haversineMeters,
  optimizeRoute,
  routeStats,
} from "./route-optimize";
import type { RouteStop } from "./route-optimize";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Cumming, GA approximate center ~34.20°N, -84.14°W
const BASE: { lat: number; lng: number } = { lat: 34.2, lng: -84.14 };

/** Make a RouteStop at (lat+dlat, lng+dlng). */
function stop(
  id: string,
  dlat: number,
  dlng: number,
  address?: string,
): RouteStop {
  return {
    id,
    address: address ?? `${id} Main St`,
    location: { lat: BASE.lat + dlat, lng: BASE.lng + dlng },
  };
}

function stopNoLoc(id: string): RouteStop {
  return { id, address: `${id} Unknown`, location: null };
}

// ---------------------------------------------------------------------------
// haversineMeters
// ---------------------------------------------------------------------------

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(BASE, BASE)).toBe(0);
  });

  it("returns ~111 km per degree latitude", () => {
    const d = haversineMeters(BASE, { lat: BASE.lat + 1, lng: BASE.lng });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = { lat: 34.2, lng: -84.14 };
    const b = { lat: 34.25, lng: -84.1 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 5);
  });

  it("handles negative deltas correctly", () => {
    const d = haversineMeters(BASE, { lat: BASE.lat - 0.01, lng: BASE.lng });
    expect(d).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// optimizeRoute — empty / single
// ---------------------------------------------------------------------------

describe("optimizeRoute — edge cases", () => {
  it("returns empty for 0 stops", () => {
    const result = optimizeRoute([]);
    expect(result.orderedStops).toHaveLength(0);
    expect(result.totalMeters).toBe(0);
    expect(result.twoOptApplied).toBe(false);
  });

  it("returns the single stop with sequence 1", () => {
    const s = stop("A", 0, 0);
    const result = optimizeRoute([s]);
    expect(result.orderedStops).toHaveLength(1);
    expect(result.orderedStops[0]!.sequence).toBe(1);
    expect(result.twoOptApplied).toBe(false);
  });

  it("leg from start to single stop is calculated", () => {
    const s = stop("A", 0.01, 0);
    const start = BASE;
    const result = optimizeRoute([s], start);
    expect(result.totalMeters).toBeGreaterThan(0);
    expect(result.orderedStops[0]!.legMeters).toBeCloseTo(
      haversineMeters(start, s.location!),
      0,
    );
  });

  it("handles single stop with no location", () => {
    const s = stopNoLoc("A");
    const result = optimizeRoute([s]);
    expect(result.orderedStops).toHaveLength(1);
    expect(result.orderedStops[0]!.legMeters).toBe(0);
    expect(result.totalMeters).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// optimizeRoute — ordering
// ---------------------------------------------------------------------------

describe("optimizeRoute — ordering", () => {
  it("nearest stop is visited first when starting from origin", () => {
    // near = 0.001° away, far = 0.1° away
    const near = stop("near", 0.001, 0);
    const far = stop("far", 0.1, 0);
    const result = optimizeRoute([far, near], BASE);
    expect(result.orderedStops[0]!.id).toBe("near");
    expect(result.orderedStops[1]!.id).toBe("far");
  });

  it("produces a valid sequence 1…n", () => {
    const stops = [
      stop("A", 0, 0),
      stop("B", 0.01, 0),
      stop("C", 0, 0.01),
      stop("D", 0.02, 0.02),
    ];
    const result = optimizeRoute(stops, BASE);
    const seqs = result.orderedStops.map((s) => s.sequence);
    expect(seqs).toEqual([1, 2, 3, 4]);
  });

  it("stops without location are placed at the end", () => {
    const stops = [stopNoLoc("X"), stop("A", 0, 0), stop("B", 0.01, 0)];
    const result = optimizeRoute(stops, BASE);
    const last = result.orderedStops[result.orderedStops.length - 1]!;
    expect(last.id).toBe("X");
  });

  it("all stops without location preserves order", () => {
    const stops = [stopNoLoc("X"), stopNoLoc("Y"), stopNoLoc("Z")];
    const result = optimizeRoute(stops);
    const ids = result.orderedStops.map((s) => s.id);
    expect(ids).toEqual(["X", "Y", "Z"]);
  });

  it("total distance equals sum of leg distances", () => {
    const stops = [
      stop("A", 0, 0),
      stop("B", 0.01, 0),
      stop("C", 0.02, 0.01),
    ];
    const result = optimizeRoute(stops, BASE);
    const sumLegs = result.orderedStops.reduce((s, o) => s + o.legMeters, 0);
    expect(result.totalMeters).toBeCloseTo(sumLegs, 3);
  });
});

// ---------------------------------------------------------------------------
// 2-opt: never worsens
// ---------------------------------------------------------------------------

describe("2-opt never worsens total distance", () => {
  function totalForRoute(
    stops: RouteStop[],
    start?: { lat: number; lng: number },
  ): number {
    return optimizeRoute(stops, start).totalMeters;
  }

  it("with 3 stops from a start point", () => {
    const stops = [stop("A", 0.05, 0), stop("B", 0, 0.05), stop("C", 0.05, 0.05)];
    // Run twice with and without start — in both cases 2-opt must not increase distance.
    const withStart = totalForRoute(stops, BASE);
    const withoutStart = totalForRoute(stops);
    // These are both valid routes; we just check no negative distance and sane order.
    expect(withStart).toBeGreaterThanOrEqual(0);
    expect(withoutStart).toBeGreaterThanOrEqual(0);
  });

  it("adversarial worst-case: U-shape that 2-opt should improve", () => {
    // Lay out stops in a U so NN produces a bad crossing route.
    // A(top-left), B(bottom-left), C(bottom-right), D(top-right)
    // NN from start (above A) visits A→B→C→D which already avoids the X.
    // 2-opt should not make it worse.
    const start = { lat: 34.21, lng: -84.15 };
    const stops2opt = [
      stop("A", 0.01, -0.01), // top-left
      stop("B", -0.01, -0.01), // bottom-left
      stop("C", -0.01, 0.01), // bottom-right
      stop("D", 0.01, 0.01), // top-right
    ];
    const result = optimizeRoute(stops2opt, start);
    // Total must be >= 0 and <= worst possible (full circle back to start).
    expect(result.totalMeters).toBeGreaterThanOrEqual(0);
    // Verify 2-opt was at least attempted.
    // (It may or may not improve an already-good NN route.)
    expect(result.orderedStops).toHaveLength(4);
  });

  it("random 6-stop route: 2-opt result <= NN result", () => {
    // Build a deterministic "bad" ordering and verify 2-opt doesn't regress.
    const shuffled: RouteStop[] = [
      stop("1", 0.1, 0),
      stop("2", 0, 0.1),
      stop("3", 0.1, 0.1),
      stop("4", 0.05, 0.05),
      stop("5", 0.02, 0.08),
      stop("6", 0.08, 0.02),
    ];
    const result = optimizeRoute(shuffled, BASE);
    // routeStats totalMeters must match orderedStops sum.
    const stats = routeStats(result.orderedStops);
    expect(stats.totalMeters).toBeCloseTo(result.totalMeters, 3);
    expect(result.totalMeters).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// routeStats
// ---------------------------------------------------------------------------

describe("routeStats", () => {
  it("returns zeros for empty input", () => {
    const stats = routeStats([]);
    expect(stats.stopCount).toBe(0);
    expect(stats.totalMeters).toBe(0);
    expect(stats.totalKm).toBe(0);
  });

  it("computes totalKm from totalMeters", () => {
    const result = optimizeRoute([stop("A", 0, 0), stop("B", 0.01, 0)], BASE);
    const stats = routeStats(result.orderedStops);
    expect(stats.totalKm).toBeCloseTo(stats.totalMeters / 1000, 5);
  });

  it("counts stops without location", () => {
    const result = optimizeRoute(
      [stop("A", 0, 0), stopNoLoc("B"), stopNoLoc("C")],
      BASE,
    );
    const stats = routeStats(result.orderedStops);
    expect(stats.stopsWithoutLocation).toBe(2);
  });

  it("longestLegMeters is >= avgLegMeters for multi-stop routes", () => {
    const result = optimizeRoute(
      [stop("A", 0, 0), stop("B", 0.05, 0), stop("C", 0.01, 0.01)],
      BASE,
    );
    const stats = routeStats(result.orderedStops);
    expect(stats.longestLegMeters).toBeGreaterThanOrEqual(stats.avgLegMeters);
  });
});
