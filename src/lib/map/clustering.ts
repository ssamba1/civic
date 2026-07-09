import Supercluster from "supercluster";
import type { DashboardReport } from "@/lib/dashboard-data";

// Data-layer clustering for the report map (LCP-17). agents.md pitfall:
// "marker clustering breaks with >5k points. Use the supercluster lib at the
// data layer." This is that layer — pure, framework-free, unit-testable. The
// map component tracks the live viewport and asks this module what to draw.

/** A point supercluster carries through: enough to render + click a leaf. */
export interface ClusterPointProps {
  reportId: string;
  severity: number;
  demo: boolean;
}

/** What the layer renders: either an aggregate bubble or a single report. */
export type ClusterFeature =
  | {
      kind: "cluster";
      /** supercluster's numeric cluster id, for getClusterExpansionZoom. */
      clusterId: number;
      lng: number;
      lat: number;
      count: number;
    }
  | {
      kind: "leaf";
      reportId: string;
      severity: number;
      demo: boolean;
      lng: number;
      lat: number;
    };

/** [west, south, east, north] in degrees — supercluster's bbox order. */
export type Bounds = [number, number, number, number];

export interface ClusterOptions {
  /** Max zoom at which points still cluster; above this every point is a leaf. */
  maxZoom?: number;
  /** Cluster radius in pixels. */
  radius?: number;
}

/**
 * Build a supercluster index over the reports. O(n) load; memoize on the
 * reports array in the caller so panning/zooming reuses one index. Reports
 * without finite coordinates are skipped (a NaN lng/lat would corrupt the
 * KD-tree and throw at query time).
 */
export function buildClusterIndex(
  reports: DashboardReport[],
  opts: ClusterOptions = {},
): Supercluster<ClusterPointProps> {
  const index = new Supercluster<ClusterPointProps>({
    radius: opts.radius ?? 60,
    maxZoom: opts.maxZoom ?? 16,
  });
  const features = reports
    .filter(
      (r) =>
        Number.isFinite(r.location?.lng) && Number.isFinite(r.location?.lat),
    )
    .map((r) => ({
      type: "Feature" as const,
      properties: {
        reportId: r.id,
        severity: r.severity,
        demo: Boolean(r.demo),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [r.location.lng, r.location.lat] as [number, number],
      },
    }));
  index.load(features);
  return index;
}

/**
 * Query the index for the current viewport. Returns a flat list of clusters +
 * unclustered leaves to draw. `zoom` is floored — supercluster keys tiles by
 * integer zoom, and a fractional zoom otherwise yields empty results at the
 * top end.
 */
export function clustersForView(
  index: Supercluster<ClusterPointProps>,
  bounds: Bounds,
  zoom: number,
): ClusterFeature[] {
  const z = Math.floor(zoom);
  const raw = index.getClusters(bounds, z);
  const out: ClusterFeature[] = [];
  for (const f of raw) {
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const props = f.properties as
      | (ClusterPointProps & { cluster?: false })
      | { cluster: true; cluster_id: number; point_count: number };
    if ("cluster" in props && props.cluster) {
      out.push({
        kind: "cluster",
        clusterId: props.cluster_id,
        lng,
        lat,
        count: props.point_count,
      });
    } else {
      const leaf = props as ClusterPointProps;
      out.push({
        kind: "leaf",
        reportId: leaf.reportId,
        severity: leaf.severity,
        demo: leaf.demo,
        lng,
        lat,
      });
    }
  }
  return out;
}

/**
 * Zoom at which a cluster breaks apart — feed into a flyTo when a bubble is
 * clicked so tapping a cluster drills in. Clamped defensively.
 */
export function clusterExpansionZoom(
  index: Supercluster<ClusterPointProps>,
  clusterId: number,
): number {
  return Math.min(index.getClusterExpansionZoom(clusterId), 20);
}
