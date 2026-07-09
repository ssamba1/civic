import { describe, expect, it } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import {
  bucketByGrid,
  computeBounds,
  toHeatmapPoints,
} from "./heatmap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<DashboardReport> & { lng: number; lat: number },
): DashboardReport {
  return {
    id: "r-" + Math.random(),
    category: "pothole",
    severity: 3,
    status: "open",
    address: "123 Main St",
    location: { lng: overrides.lng, lat: overrides.lat },
    photo_public_url: "",
    created_at: overrides.created_at ?? new Date().toISOString(),
    reporter_id: "u-1",
    ...overrides,
  } as unknown as DashboardReport;
}

const NOW = new Date("2024-06-15T12:00:00Z");

// ---------------------------------------------------------------------------
// toHeatmapPoints
// ---------------------------------------------------------------------------

describe("toHeatmapPoints", () => {
  it("returns empty array for empty input", () => {
    expect(toHeatmapPoints([], NOW)).toEqual([]);
  });

  it("returns one point for a single report", () => {
    const r = makeReport({ lng: -84.0, lat: 34.1, severity: 5 });
    const pts = toHeatmapPoints([r], NOW);
    expect(pts).toHaveLength(1);
    expect(pts[0].position).toEqual([-84.0, 34.1]);
    expect(pts[0].weight).toBeGreaterThan(0);
    expect(pts[0].weight).toBeLessThanOrEqual(1);
  });

  it("assigns higher weight to more severe reports (same date)", () => {
    const low = makeReport({ lng: 0, lat: 0, severity: 1, created_at: NOW.toISOString() });
    const high = makeReport({ lng: 0, lat: 0, severity: 5, created_at: NOW.toISOString() });
    const [ptLow] = toHeatmapPoints([low], NOW);
    const [ptHigh] = toHeatmapPoints([high], NOW);
    expect(ptHigh.weight).toBeGreaterThan(ptLow.weight);
  });

  it("assigns higher weight to newer reports (same severity)", () => {
    const old = makeReport({
      lng: 0,
      lat: 0,
      severity: 3,
      created_at: new Date("2023-01-01").toISOString(),
    });
    const recent = makeReport({ lng: 0, lat: 0, severity: 3, created_at: NOW.toISOString() });
    const [ptOld] = toHeatmapPoints([old], NOW);
    const [ptRecent] = toHeatmapPoints([recent], NOW);
    expect(ptRecent.weight).toBeGreaterThan(ptOld.weight);
  });

  it("filters out reports with invalid location", () => {
    const bad = {
      id: "bad",
      location: { lng: NaN, lat: 34.1 },
      severity: 3,
      created_at: NOW.toISOString(),
    } as unknown as DashboardReport;
    expect(toHeatmapPoints([bad], NOW)).toHaveLength(0);
  });

  it("filters out reports missing location", () => {
    const noLoc = {
      id: "noloc",
      // no location field
      severity: 3,
      created_at: NOW.toISOString(),
    } as unknown as DashboardReport;
    expect(toHeatmapPoints([noLoc], NOW)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeBounds
// ---------------------------------------------------------------------------

describe("computeBounds", () => {
  it("returns null for empty points", () => {
    expect(computeBounds([])).toBeNull();
  });

  it("returns a valid bbox for a single point", () => {
    const pts = [{ position: [-84.0, 34.1] as [number, number], weight: 1 }];
    const bounds = computeBounds(pts);
    expect(bounds).not.toBeNull();
    expect(bounds!.center).toEqual([-84.0, 34.1]);
    expect(bounds!.bbox).toHaveLength(4);
  });

  it("computes correct bbox for multiple points", () => {
    const pts = [
      { position: [-84.5, 34.0] as [number, number], weight: 1 },
      { position: [-84.0, 34.5] as [number, number], weight: 1 },
    ];
    const bounds = computeBounds(pts);
    expect(bounds!.bbox[0]).toBe(-84.5); // west
    expect(bounds!.bbox[1]).toBe(34.0);  // south
    expect(bounds!.bbox[2]).toBe(-84.0); // east
    expect(bounds!.bbox[3]).toBe(34.5);  // north
    expect(bounds!.center[0]).toBeCloseTo(-84.25, 5);
    expect(bounds!.center[1]).toBeCloseTo(34.25, 5);
  });

  it("zoom is clamped between 9 and 14", () => {
    // Very spread points → low zoom
    const wide = [
      { position: [-100, 10] as [number, number], weight: 1 },
      { position: [100, 60] as [number, number], weight: 1 },
    ];
    const b1 = computeBounds(wide)!;
    expect(b1.zoom).toBeGreaterThanOrEqual(9);
    expect(b1.zoom).toBeLessThanOrEqual(14);

    // Tight cluster → high zoom
    const tight = [
      { position: [-84.001, 34.001] as [number, number], weight: 1 },
      { position: [-84.002, 34.002] as [number, number], weight: 1 },
    ];
    const b2 = computeBounds(tight)!;
    expect(b2.zoom).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// bucketByGrid
// ---------------------------------------------------------------------------

describe("bucketByGrid", () => {
  it("returns empty array for empty input", () => {
    expect(bucketByGrid([])).toEqual([]);
  });

  it("places a single point into exactly one cell", () => {
    const pts = [{ position: [-84.055, 34.123] as [number, number], weight: 0.8 }];
    const cells = bucketByGrid(pts, 0.01);
    expect(cells).toHaveLength(1);
    expect(cells[0].count).toBe(1);
    expect(cells[0].totalWeight).toBeCloseTo(0.8, 5);
  });

  it("groups nearby points into the same cell", () => {
    // Both points are within the same 0.01° cell: floor(34.001/0.01)=3400, floor(34.005/0.01)=3400
    const pts = [
      { position: [10.001, 34.001] as [number, number], weight: 0.5 },
      { position: [10.005, 34.005] as [number, number], weight: 0.5 },
    ];
    const cells = bucketByGrid(pts, 0.01);
    expect(cells).toHaveLength(1);
    expect(cells[0].count).toBe(2);
    expect(cells[0].totalWeight).toBeCloseTo(1.0, 5);
  });

  it("places far-apart points into different cells", () => {
    const pts = [
      { position: [-84.0, 34.0] as [number, number], weight: 0.5 },
      { position: [-83.0, 35.0] as [number, number], weight: 0.5 },
    ];
    const cells = bucketByGrid(pts, 0.01);
    expect(cells).toHaveLength(2);
  });

  it("avgSeverity reflects raw severity, not composite weight", () => {
    // Two points with very different recency (so weight ≠ severity) but the
    // same severity = 4. avgSeverity should be 4, not distorted by weight.
    // weight = severity/5 * recencyFactor; low-weight point has recencyFactor≈0.1
    const pts: Array<{ position: [number, number]; weight: number; rawSeverity: number }> = [
      { position: [10.001, 34.001], weight: 0.8, rawSeverity: 4 }, // high recency
      { position: [10.005, 34.005], weight: 0.08, rawSeverity: 4 }, // low recency
    ];
    const cells = bucketByGrid(pts, 0.01);
    expect(cells).toHaveLength(1);
    // Correct: avg of [4, 4] = 4
    expect(cells[0].avgSeverity).toBe(4);
    // Sanity check: the old approach (weightSum/count * 5) would give ≈ (0.88/2)*5 = 2.2 → 2
    // Confirm our result is NOT that wrong value:
    expect(cells[0].avgSeverity).not.toBe(2);
  });

  it("avgSeverity falls back to 3 when rawSeverity is absent", () => {
    // Points without rawSeverity (manually constructed) get neutral fallback.
    const pts = [
      { position: [10.001, 34.001] as [number, number], weight: 0.5 },
    ];
    const cells = bucketByGrid(pts, 0.01);
    expect(cells[0].avgSeverity).toBe(3);
  });

  it("cell centre positions fall inside the correct cell", () => {
    // Use positive coords to avoid JS modulo negative-number quirks
    const pts = [{ position: [10.03, 34.07] as [number, number], weight: 1 }];
    const cell = 0.1;
    const cells = bucketByGrid(pts, cell);
    expect(cells).toHaveLength(1);
    const [cLng, cLat] = cells[0].position;
    // Centre should be the midpoint of the cell that contains [10.03, 34.07]:
    // col = floor(10.03/0.1)=100 → centre lng = 100.5 * 0.1 = 10.05
    // row = floor(34.07/0.1)=340 → centre lat = 340.5 * 0.1 = 34.05
    expect(cLng).toBeCloseTo(10.05, 4);
    expect(cLat).toBeCloseTo(34.05, 4);
  });
});
