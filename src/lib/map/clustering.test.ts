import { describe, expect, it } from "vitest";
import type { DashboardReport } from "@/lib/dashboard-data";
import {
  type Bounds,
  buildClusterIndex,
  clusterExpansionZoom,
  clustersForView,
} from "./clustering";

// Minimal DashboardReport factory — only the fields clustering reads.
function report(
  id: string,
  lng: number,
  lat: number,
  extra: Partial<DashboardReport> = {},
): DashboardReport {
  return {
    id,
    severity: 3,
    demo: false,
    location: { lng, lat },
    // biome-ignore lint/suspicious/noExplicitAny: test factory fills only the fields under test
    ...(extra as any),
  } as DashboardReport;
}

// Whole world.
const WORLD: Bounds = [-180, -85, 180, 85];

describe("clustering", () => {
  it("collapses tightly-grouped points into one cluster at low zoom", () => {
    // 10 points within ~a few hundred meters near Cumming, GA.
    const reports = Array.from({ length: 10 }, (_, i) =>
      report(`r${i}`, -84.14 + i * 0.0005, 34.207 + i * 0.0005),
    );
    const index = buildClusterIndex(reports);
    const features = clustersForView(index, WORLD, 5);
    // At world/low zoom they merge — far fewer features than points.
    expect(features.length).toBeLessThan(reports.length);
    const clusters = features.filter((f) => f.kind === "cluster");
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    // Cluster counts sum back to the input.
    const clustered = clusters.reduce(
      (n, c) => n + (c.kind === "cluster" ? c.count : 0),
      0,
    );
    const leaves = features.filter((f) => f.kind === "leaf").length;
    expect(clustered + leaves).toBe(reports.length);
  });

  it("returns every point as a leaf at high zoom", () => {
    const reports = Array.from({ length: 10 }, (_, i) =>
      report(`r${i}`, -84.14 + i * 0.01, 34.2 + i * 0.01),
    );
    const index = buildClusterIndex(reports, { maxZoom: 16 });
    const features = clustersForView(index, WORLD, 20);
    expect(features.every((f) => f.kind === "leaf")).toBe(true);
    expect(features).toHaveLength(reports.length);
  });

  it("preserves leaf props (reportId, severity, demo)", () => {
    const reports = [
      report("keep-me", -84.14, 34.2, { severity: 5, demo: true }),
    ];
    const index = buildClusterIndex(reports);
    const [f] = clustersForView(index, WORLD, 18);
    expect(f.kind).toBe("leaf");
    if (f.kind === "leaf") {
      expect(f.reportId).toBe("keep-me");
      expect(f.severity).toBe(5);
      expect(f.demo).toBe(true);
    }
  });

  it("excludes points outside the viewport bounds", () => {
    const reports = [
      report("in", -84.14, 34.2),
      report("far", 150, -40), // opposite hemisphere
    ];
    const index = buildClusterIndex(reports);
    // Bounds tightly around Cumming.
    const local: Bounds = [-84.3, 34.0, -84.0, 34.4];
    const features = clustersForView(index, local, 12);
    const ids = features
      .filter((f) => f.kind === "leaf")
      .map((f) => (f.kind === "leaf" ? f.reportId : ""));
    expect(ids).toContain("in");
    expect(ids).not.toContain("far");
  });

  it("skips points with non-finite coordinates without throwing", () => {
    const reports = [
      report("ok", -84.14, 34.2),
      report("bad", Number.NaN, 34.2),
    ];
    const index = buildClusterIndex(reports);
    const features = clustersForView(index, WORLD, 18);
    const ids = features.map((f) => (f.kind === "leaf" ? f.reportId : ""));
    expect(ids).toContain("ok");
    expect(ids).not.toContain("bad");
  });

  it("clusterExpansionZoom returns a drill-in zoom for a real cluster", () => {
    const reports = Array.from({ length: 8 }, (_, i) =>
      report(`r${i}`, -84.14 + i * 0.0004, 34.207 + i * 0.0004),
    );
    const index = buildClusterIndex(reports);
    const clusters = clustersForView(index, WORLD, 5).filter(
      (f) => f.kind === "cluster",
    );
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    if (clusters[0].kind === "cluster") {
      const z = clusterExpansionZoom(index, clusters[0].clusterId);
      expect(z).toBeGreaterThan(5);
      expect(z).toBeLessThanOrEqual(20);
    }
  });
});
