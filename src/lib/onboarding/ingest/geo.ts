// Minimal GeoJSON polygon helpers for synthetic point scatter (F5). No deps.
// Handles Polygon and MultiPolygon; even-odd ray casting across all rings, so
// points inside holes are correctly excluded.

import type { BoundaryGeometry } from "@/lib/onboarding/tiger";

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

type Ring = number[][]; // [ [lng,lat], ... ]

/** Per-polygon ring lists: Polygon → [rings]; MultiPolygon → [poly0rings, ...]. */
function toPolygons(geom: BoundaryGeometry): Ring[][] {
  const coords = geom.coordinates as unknown;
  if (geom.type === "Polygon") return [coords as Ring[]];
  // MultiPolygon
  return coords as Ring[][];
}

export function boundingBox(geom: BoundaryGeometry): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const rings of toPolygons(geom)) {
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLng, minLat, maxLng, maxLat };
}

function inRings(x: number, y: number, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersects =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

/** True when (lng,lat) is inside the boundary (any polygon; holes excluded). */
export function pointInBoundary(
  lng: number,
  lat: number,
  geom: BoundaryGeometry,
): boolean {
  for (const rings of toPolygons(geom)) {
    if (inRings(lng, lat, rings)) return true;
  }
  return false;
}
