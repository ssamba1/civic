/**
 * Pure analytics helpers for the report density heatmap.
 *
 * Weight strategy:
 *   weight = severityFactor * recencyFactor
 *
 *   severityFactor = severity / 5  (range 0.2 – 1.0; higher severity → heavier)
 *
 *   recencyFactor  = exp(-ageDays / 90)
 *     - A report submitted today has factor 1.0.
 *     - A report 90 days old has factor ~0.37 (natural decay constant).
 *     - Older than 180 days decays to ~0.14 (still counted but barely).
 *
 *   Combined weight is in the range (0, 1].
 *
 * No server/browser imports — this file is pure TypeScript so it can be
 * imported by server components, API routes, and Vitest unit tests alike.
 */

import type { DashboardReport } from "@/lib/dashboard-data";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HeatmapPoint {
  position: [lng: number, lat: number];
  /** Normalised weight in (0, 1]. Used by deck.gl HeatmapLayer `getWeight`. */
  weight: number;
  /**
   * Raw severity (1–5) from the source report, carried through so that
   * `bucketByGrid` can compute a true average severity rather than backing
   * it out of the composite weight (which is severity × recency and therefore
   * systematically understated). Optional for callers that construct points
   * manually; `bucketByGrid` falls back to 3 when absent.
   */
  rawSeverity?: number;
}

export interface ViewportBounds {
  /** [west, south, east, north] — matches MapLibre fitBounds / deck.gl WebMercatorViewport */
  bbox: [number, number, number, number];
  /** Centroid of all points */
  center: [lng: number, lat: number];
  /** Suggested zoom level (clamped 9–14). Coarse estimate; the map's fitBounds overrides. */
  zoom: number;
}

export interface GridCell {
  /** Cell centre position */
  position: [lng: number, lat: number];
  /** Number of reports that fell into this cell */
  count: number;
  /** Sum of weights in this cell */
  totalWeight: number;
  /** Average severity (1–5) */
  avgSeverity: number;
}

// ---------------------------------------------------------------------------
// toHeatmapPoints
// ---------------------------------------------------------------------------

const DECAY_DAYS = 90;

/** Converts a list of DashboardReports to weighted HeatmapPoints. */
export function toHeatmapPoints(
  reports: DashboardReport[],
  now: Date = new Date(),
): HeatmapPoint[] {
  const nowMs = now.getTime();
  return reports
    .filter(
      (r) =>
        typeof r.location?.lng === "number" &&
        typeof r.location?.lat === "number" &&
        Number.isFinite(r.location.lng) &&
        Number.isFinite(r.location.lat),
    )
    .map((r) => {
      const ageDays = (nowMs - new Date(r.created_at).getTime()) / 86_400_000;
      const recency = Math.exp(-Math.max(0, ageDays) / DECAY_DAYS);
      const severity = (r.severity ?? 3) / 5;
      const weight = Math.max(0.01, severity * recency);
      return {
        position: [r.location.lng, r.location.lat] as [number, number],
        weight,
        rawSeverity: r.severity ?? 3,
      };
    });
}

// ---------------------------------------------------------------------------
// computeBounds
// ---------------------------------------------------------------------------

/** Returns viewport bounds + centre for auto-fitting the map to the points. */
export function computeBounds(points: HeatmapPoint[]): ViewportBounds | null {
  if (points.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const { position: [lng, lat] } of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;

  // Rough zoom heuristic: wider span → lower zoom.
  const spanDeg = Math.max(maxLng - minLng, maxLat - minLat);
  const zoom =
    spanDeg < 0.01 ? 14 : spanDeg < 0.05 ? 13 : spanDeg < 0.2 ? 12 : spanDeg < 1 ? 11 : 10;

  return {
    bbox: [minLng, minLat, maxLng, maxLat],
    center: [centerLng, centerLat],
    zoom: Math.min(14, Math.max(9, zoom)),
  };
}

// ---------------------------------------------------------------------------
// bucketByGrid
// ---------------------------------------------------------------------------

/**
 * Aggregates HeatmapPoints into a regular lat/lng grid.
 *
 * @param points     HeatmapPoints (output of toHeatmapPoints)
 * @param cellDegrees  Cell size in decimal degrees (default 0.01 ≈ 1 km)
 */
export function bucketByGrid(
  points: HeatmapPoint[],
  cellDegrees = 0.01,
): GridCell[] {
  if (points.length === 0) return [];

  // Accumulate raw severity per cell so avgSeverity reflects true severity
  // (1–5) rather than the composite weight (severity × recency), which is
  // systematically understated due to the recency multiplier.
  const cells = new Map<
    string,
    { lngSum: number; latSum: number; count: number; weightSum: number; rawSeveritySum: number }
  >();

  for (const { position: [lng, lat], weight, rawSeverity } of points) {
    const col = Math.floor(lng / cellDegrees);
    const row = Math.floor(lat / cellDegrees);
    const key = `${col}:${row}`;
    const cellLng = (col + 0.5) * cellDegrees;
    const cellLat = (row + 0.5) * cellDegrees;
    // rawSeverity is present on points produced by toHeatmapPoints; fall back
    // to 3 (neutral) for any HeatmapPoint constructed outside that path.
    const sev = rawSeverity ?? 3;
    const existing = cells.get(key);
    if (existing) {
      existing.count += 1;
      existing.weightSum += weight;
      existing.rawSeveritySum += sev;
    } else {
      cells.set(key, { lngSum: cellLng, latSum: cellLat, count: 1, weightSum: weight, rawSeveritySum: sev });
    }
  }

  return Array.from(cells.values()).map(({ lngSum, latSum, count, weightSum, rawSeveritySum }) => ({
    position: [lngSum, latSum] as [number, number],
    count,
    totalWeight: weightSum,
    // avgSeverity is the arithmetic mean of raw severity values (1–5),
    // rounded to the nearest integer and clamped to the valid range.
    avgSeverity: Math.round(Math.min(5, Math.max(1, rawSeveritySum / count))),
  }));
}
