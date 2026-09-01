/**
 * Crew route optimization, pure compute, no I/O, no server-only imports.
 * Safe to import from both server and client contexts.
 *
 * Heuristic: nearest-neighbour construction + optional 2-opt improvement pass.
 *
 * Nearest-neighbour (NN): start at a depot (or first stop if none), repeatedly
 * pick the unvisited stop closest to the current position. O(n²) time.
 *
 * 2-opt: after NN, scan all pairs (i, k) and check whether reversing the
 * sub-route [i+1…k] improves total distance. Repeat until no improvement.
 * O(n²) per pass, typically 1-3 passes. Limits: does not cross time windows;
 * does not handle traffic or one-way streets; degrades gracefully on ≤2 stops
 * (returns immediately). For city crews of 5-20 stops this is fast enough to
 * run synchronously in a server action.
 */

import type { GeoPoint } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteStop {
  /** Work order id. */
  id: string;
  /** Report address, for display. */
  address: string | null;
  /** Geographic position. May be null when location data is missing. */
  location: GeoPoint | null;
  /** Any extra fields the caller wants to carry through (untouched). */
  meta?: Record<string, unknown>;
}

export interface OrderedStop extends RouteStop {
  /** 1-based position in the optimized route. */
  sequence: number;
  /** Distance in meters from the previous stop (or from start, for sequence=1). */
  legMeters: number;
}

export interface OptimizeRouteResult {
  orderedStops: OrderedStop[];
  /** Total route distance in meters (sum of all legs). */
  totalMeters: number;
  /** Whether the 2-opt pass was run (false when stops < 3). */
  twoOptApplied: boolean;
}

export interface RouteStats {
  stopCount: number;
  totalMeters: number;
  totalKm: number;
  avgLegMeters: number;
  longestLegMeters: number;
  /** Stops whose location is null and were therefore placed last in the route. */
  stopsWithoutLocation: number;
}

// ---------------------------------------------------------------------------
// haversineMeters
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two geographic points in metres.
 * Uses the haversine formula. Accuracy within 0.5% for distances < 1 000 km,
 * more than sufficient for intra-city crew routing.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(aa));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Total route distance for an ordered array of stops (with optional start). */
function totalDistance(stops: RouteStop[], start: GeoPoint | null): number {
  let dist = 0;
  let prev = start;
  for (const s of stops) {
    if (prev && s.location) {
      dist += haversineMeters(prev, s.location);
    }
    prev = s.location ?? prev;
  }
  return dist;
}

/**
 * Nearest-neighbour construction from `start` (or first locatable stop).
 * Stops without a location are placed at the end in their original order.
 */
function nearestNeighbour(
  stops: RouteStop[],
  start: GeoPoint | null,
): RouteStop[] {
  const withLoc = stops.filter((s) => s.location !== null);
  const noLoc = stops.filter((s) => s.location === null);

  if (withLoc.length === 0) return [...stops];

  const unvisited = new Set(withLoc.map((_, i) => i));
  const ordered: RouteStop[] = [];
  let current = start;

  while (unvisited.size > 0) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (const i of unvisited) {
      const s = withLoc[i]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- filtered above
      const d = current ? haversineMeters(current, s.location!) : 0;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    unvisited.delete(bestIdx);
    const chosen = withLoc[bestIdx]!;
    ordered.push(chosen);
    current = chosen.location;
  }

  return [...ordered, ...noLoc];
}

/**
 * Single 2-opt improvement pass over `route`. Returns a new array if any swap
 * improved distance, or the original array (same reference) if no improvement.
 */
function twoOptPass(route: RouteStop[], start: GeoPoint | null): RouteStop[] {
  // Only consider stops that have a location for swapping; ignore tail no-loc stops.
  const locCount = route.filter((s) => s.location !== null).length;
  if (locCount < 3) return route;

  let best = route;
  let bestDist = totalDistance(route, start);
  let improved = false;

  for (let i = 0; i < locCount - 1; i++) {
    for (let k = i + 1; k < locCount; k++) {
      // Reverse the sub-route from i+1 to k.
      const candidate = [
        ...route.slice(0, i + 1),
        ...route.slice(i + 1, k + 1).reverse(),
        ...route.slice(k + 1),
      ];
      const d = totalDistance(candidate, start);
      if (d < bestDist - 0.001) {
        // 1 mm tolerance to avoid float noise
        best = candidate;
        bestDist = d;
        improved = true;
      }
    }
  }

  return improved ? best : route;
}

// ---------------------------------------------------------------------------
// optimizeRoute
// ---------------------------------------------------------------------------

/**
 * Compute an efficient visit order for a crew's stops using nearest-neighbour
 * construction + 2-opt improvement.
 *
 * @param stops  - Work-order stops to order. May include stops with null location.
 * @param start  - Optional depot/start point. When omitted the NN starts from
 *                 the first locatable stop.
 */
export function optimizeRoute(
  stops: RouteStop[],
  start?: GeoPoint,
): OptimizeRouteResult {
  if (stops.length === 0) {
    return { orderedStops: [], totalMeters: 0, twoOptApplied: false };
  }

  if (stops.length === 1) {
    const s = stops[0]!;
    const legMeters =
      start && s.location ? haversineMeters(start, s.location) : 0;
    return {
      orderedStops: [{ ...s, sequence: 1, legMeters }],
      totalMeters: legMeters,
      twoOptApplied: false,
    };
  }

  // Step 1: nearest-neighbour construction.
  let ordered = nearestNeighbour(stops, start ?? null);

  // Step 2: 2-opt improvement (only meaningful for 3+ locatable stops).
  const locatableCount = ordered.filter((s) => s.location !== null).length;
  let twoOptApplied = false;
  if (locatableCount >= 3) {
    // Run up to 10 passes or until no improvement.
    for (let pass = 0; pass < 10; pass++) {
      const next = twoOptPass(ordered, start ?? null);
      if (next === ordered) break; // same reference = no improvement this pass
      ordered = next;
      twoOptApplied = true;
    }
  }

  // Step 3: annotate with sequence + leg distances.
  let prev: GeoPoint | null = start ?? null;
  let totalMeters = 0;
  const orderedStops: OrderedStop[] = ordered.map((s, idx) => {
    const legMeters =
      prev && s.location ? haversineMeters(prev, s.location) : 0;
    totalMeters += legMeters;
    prev = s.location ?? prev;
    return { ...s, sequence: idx + 1, legMeters };
  });

  return { orderedStops, totalMeters, twoOptApplied };
}

// ---------------------------------------------------------------------------
// routeStats
// ---------------------------------------------------------------------------

/** Derive display-ready stats from an already-optimized stop list. */
export function routeStats(orderedStops: OrderedStop[]): RouteStats {
  const stopCount = orderedStops.length;
  if (stopCount === 0) {
    return {
      stopCount: 0,
      totalMeters: 0,
      totalKm: 0,
      avgLegMeters: 0,
      longestLegMeters: 0,
      stopsWithoutLocation: 0,
    };
  }

  let totalMeters = 0;
  let longestLegMeters = 0;
  let stopsWithoutLocation = 0;

  for (const s of orderedStops) {
    totalMeters += s.legMeters;
    if (s.legMeters > longestLegMeters) longestLegMeters = s.legMeters;
    if (!s.location) stopsWithoutLocation++;
  }

  return {
    stopCount,
    totalMeters,
    totalKm: totalMeters / 1000,
    avgLegMeters: stopCount > 0 ? totalMeters / stopCount : 0,
    longestLegMeters,
    stopsWithoutLocation,
  };
}
