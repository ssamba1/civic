/**
 * In-memory clustering of one clip's detections — 30 frames of the same
 * pothole must become ONE candidate, or the decision stage would spend a
 * Gemini call per frame. Same-class detections join a cluster when they are
 * geographically within radiusM (GPS-carrying clips), or visually near-dup
 * by aHash (GPS-less clips).
 *
 * This handles only intra-clip grouping in application code — a handful of
 * points already in memory. CROSS-clip continuity goes through PostGIS
 * (find_nearby_detection_cluster RPC, migration 056) per hard rule 7.
 * Pure functions throughout.
 */
import type { GeoPoint } from "@/lib/types";
import { hammingDistance } from "@/lib/video/phash";

/** Input to clustering: one persisted-detection candidate. */
export interface ClusterableDetection {
  /** Caller's index — mapped back to detection rows after grouping. */
  index: number;
  class: string;
  confidence: number;
  location: GeoPoint | null;
  phash: string | null;
}

export interface DetectionGroup {
  class: string;
  /** Indices (ClusterableDetection.index) of the grouped detections. */
  indices: number[];
  /** Index of the highest-confidence member — the cluster's "best frame". */
  bestIndex: number;
  maxConfidence: number;
  /** Best member's location (representative point); null when GPS-less. */
  location: GeoPoint | null;
}

/** Great-circle metres between two points (small-distance haversine). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function sameScene(
  a: ClusterableDetection,
  b: ClusterableDetection,
  radiusM: number,
  maxHamming: number,
): boolean {
  if (a.class !== b.class) return false;
  if (a.location && b.location) {
    return haversineMeters(a.location, b.location) <= radiusM;
  }
  // GPS-less: fall back to visual near-duplication of the frames.
  if (a.phash && b.phash) {
    return hammingDistance(a.phash, b.phash) <= maxHamming;
  }
  return false;
}

/**
 * Greedy single-link grouping: each detection joins the first group any of
 * whose members it matches (same class + within radius, or near-dup hash);
 * otherwise it starts a new group. O(n²) on a clip's detections — bounded
 * by frames-per-clip, not city size.
 */
export function groupDetections(
  detections: readonly ClusterableDetection[],
  radiusM: number,
  maxHamming: number,
): DetectionGroup[] {
  const groups: { members: ClusterableDetection[] }[] = [];
  for (const det of detections) {
    const home = groups.find((g) =>
      g.members.some((m) => sameScene(m, det, radiusM, maxHamming)),
    );
    if (home) home.members.push(det);
    else groups.push({ members: [det] });
  }
  return groups.map((g) => {
    let best = g.members[0];
    for (const m of g.members) if (m.confidence > best.confidence) best = m;
    return {
      class: best.class,
      indices: g.members.map((m) => m.index),
      bestIndex: best.index,
      maxConfidence: best.confidence,
      location: best.location,
    };
  });
}
