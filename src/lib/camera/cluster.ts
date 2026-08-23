// Detection clustering — the volume problem (CAMERA_LIABILITY_PIPELINE.md §4.4).
//
// A bus passes the same pothole ~20x/day across ~180 school days. Naively that
// is ~3,600 reports for one pothole. Clustering happens BEFORE a report is ever
// created: detections collapse into a cluster, and only a cluster that clears
// the confirmation threshold is promoted to a report (one Gemini call per real
// defect, not per frame).
//
// Both functions here are pure so they are unit-testable without a DB. Spatial
// distance is NOT computed in app code (agents.md rule #7): the candidate query
// supplies `distanceM` from PostGIS `ST_Distance`, and the radius check below is
// a defensive re-assertion of the same bound, not a substitute for ST_DWithin.

import {
  CLUSTER_RADIUS_M,
  PROMOTE_MIN_DISTINCT_DAYS,
  PROMOTE_MIN_PASSES,
} from "@/lib/liability/config";

export type ClusterState = "observing" | "promoted" | "resolved" | "dismissed";

/** A nearby cluster row as returned by the PostGIS candidate query. */
export interface ClusterCandidate {
  id: string;
  damageClass: string;
  state: ClusterState;
  observationCount: number;
  /** Metres from the incoming detection — computed by ST_Distance, not app math. */
  distanceM: number;
}

/** One detection, reduced to the fields clustering actually reasons about. */
export interface DetectionObservation {
  damageClass: string;
  /** ISO timestamp of frame capture. */
  capturedAt: string;
  score: number;
  /** Vehicle speed at capture — used only to prefer the sharpest crop. */
  speedMps?: number | null;
}

export type ClusterAssignment =
  | { kind: "join"; clusterId: string; distanceM: number }
  | { kind: "new" };

/**
 * Decide whether a detection joins an existing cluster or opens a new one.
 *
 * Join requires all three: same `damage_class`, within `CLUSTER_RADIUS_M`, and
 * the cluster is not `resolved`. A resolved cluster deliberately does NOT
 * absorb — a defect reappearing where one was repaired is the recurrence signal
 * `analytics_recurring_hotspots` wants, and a workmanship-claim trigger.
 *
 * A `dismissed` cluster still absorbs (so staff-rejected false positives don't
 * re-open under a new id every pass); `shouldPromote` is what keeps it from
 * ever becoming a report again.
 */
export function assignCluster(
  detection: DetectionObservation,
  nearbyClusters: readonly ClusterCandidate[],
): ClusterAssignment {
  const eligible = nearbyClusters.filter(
    (c) =>
      c.damageClass === detection.damageClass &&
      c.state !== "resolved" &&
      Number.isFinite(c.distanceM) &&
      c.distanceM <= CLUSTER_RADIUS_M,
  );
  if (eligible.length === 0) return { kind: "new" };

  // Nearest wins; ties resolve on the better-established cluster, then id, so
  // the same input always produces the same assignment.
  const best = [...eligible].sort(
    (a, b) =>
      a.distanceM - b.distanceM ||
      b.observationCount - a.observationCount ||
      a.id.localeCompare(b.id),
  )[0];

  return { kind: "join", clusterId: best.id, distanceM: best.distanceM };
}

/** UTC calendar day of an ISO timestamp, or null when unparseable. */
function utcDay(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Promotion gate: >= PROMOTE_MIN_PASSES detections spanning >=
 * PROMOTE_MIN_DISTINCT_DAYS distinct UTC dates.
 *
 * The distinct-day requirement is the whole point — 20 passes down the same
 * route on one afternoon is one shadow/wet-patch/tar-snake seen 20 times, not
 * 20 pieces of evidence. Only `observing` clusters promote: a cluster already
 * promoted has its report, and resolved/dismissed clusters must never
 * re-promote into duplicate tickets.
 */
export function shouldPromote(
  cluster: Pick<ClusterCandidate, "state">,
  detections: readonly DetectionObservation[],
): boolean {
  if (cluster.state !== "observing") return false;
  if (detections.length < PROMOTE_MIN_PASSES) return false;

  const days = new Set<string>();
  for (const d of detections) {
    const day = utcDay(d.capturedAt);
    if (day !== null) days.add(day);
  }
  return days.size >= PROMOTE_MIN_DISTINCT_DAYS;
}

/**
 * The single crop that goes to Gemini and onto the claim packet: highest
 * detector score, and on a tie the slowest pass (least motion blur).
 */
export function pickBestObservation<T extends DetectionObservation>(
  detections: readonly T[],
): T | null {
  if (detections.length === 0) return null;
  return [...detections].sort(
    (a, b) =>
      b.score - a.score ||
      (a.speedMps ?? Number.POSITIVE_INFINITY) -
        (b.speedMps ?? Number.POSITIVE_INFINITY),
  )[0];
}
