// Synthetic cold-start generator (F5), the universal fallback that fills a
// brand-new city so its dashboard isn't empty (works even when the city
// publishes no open data). Reports scatter inside the real TIGER boundary with a
// realistic category/severity/age distribution. Deterministic (seeded) so the
// demo is reproducible. NEVER emits is_emergency / dispatch-forcing data, and
// every row is tagged source:'synthetic' so KPIs can exclude it.

import type { BoundaryGeometry } from "@/lib/onboarding/tiger";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { boundingBox, pointInBoundary } from "./geo";
import type { NormalizedReport } from "./types";

// Category mix tuned to look like real municipal 311 volume (potholes dominate).
const CATEGORY_WEIGHTS: ReadonlyArray<readonly [ReportCategory, number]> = [
  ["pothole", 68],
  ["streetlight", 41],
  ["water_leak", 29],
  ["sidewalk_damage", 24],
  ["downed_sign", 22],
  ["graffiti", 18],
  ["tree_down", 14],
  ["drainage", 12],
  ["illegal_dump", 8],
  ["debris", 6],
  ["faded_signage", 3],
  ["other", 2],
];

const SEVERITY_WEIGHTS: ReadonlyArray<readonly [1 | 2 | 3 | 4 | 5, number]> = [
  [1, 5],
  [2, 20],
  [3, 40],
  [4, 25],
  [5, 10],
];

const STREET_NAMES = [
  "Main St",
  "Elm Ave",
  "Oak Dr",
  "Peachtree Rd",
  "Maple Ln",
  "Walnut Ct",
  "Cedar Blvd",
  "Pine Way",
  "Birch St",
  "Willow Ave",
  "Spruce Dr",
  "Hickory Rd",
  "Poplar Ln",
  "Magnolia Ct",
  "Dogwood Blvd",
  "Chestnut Way",
  "Sycamore St",
  "Aspen Ave",
  "Redwood Dr",
  "Juniper Rd",
];

const DAY_MS = 86_400_000;

// mulberry32, small deterministic PRNG. Seeded stream so rejection sampling
// (variable draws per point) stays reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(
  items: ReadonlyArray<readonly [T, number]>,
  r: number,
): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  const target = r * total;
  let acc = 0;
  for (const [val, w] of items) {
    acc += w;
    if (target < acc) return val;
  }
  return items[items.length - 1][0];
}

// Older reports skew resolved; fresh ones skew open. Mirrors real 311 aging.
function statusForAge(ageDays: number, r: number): ReportStatus {
  if (ageDays > 60) {
    return pickWeighted<ReportStatus>(
      [
        ["closed", 92],
        ["rejected", 8],
      ],
      r,
    );
  }
  if (ageDays > 14) {
    return pickWeighted<ReportStatus>(
      [
        ["closed", 72],
        ["in_progress", 15],
        ["dispatched", 7],
        ["open", 6],
      ],
      r,
    );
  }
  if (ageDays > 3) {
    return pickWeighted<ReportStatus>(
      [
        ["closed", 60],
        ["in_progress", 20],
        ["dispatched", 12],
        ["open", 8],
      ],
      r,
    );
  }
  return pickWeighted<ReportStatus>(
    [
      ["open", 38],
      ["dispatched", 24],
      ["in_progress", 22],
      ["closed", 16],
    ],
    r,
  );
}

export interface SyntheticOptions {
  boundary: BoundaryGeometry;
  /** Number of reports to generate. Default 200. */
  count?: number;
  /** PRNG seed for reproducibility. Default 1. */
  seed?: number;
  /** "Now" epoch ms, injectable for deterministic tests. Default Date.now(). */
  now?: number;
  /** History window. Default 180 days. */
  spanDays?: number;
}

/**
 * Generate `count` synthetic NormalizedReports scattered inside `boundary`.
 * Pure + deterministic given (seed, now). Status/age correlated; closed reports
 * get a realistic resolvedAt. Never emergencies.
 */
export function generateSyntheticReports(
  opts: SyntheticOptions,
): NormalizedReport[] {
  const count = opts.count ?? 200;
  const spanDays = opts.spanDays ?? 180;
  const now = opts.now ?? Date.now();
  const rng = mulberry32(opts.seed ?? 1);
  const bbox = boundingBox(opts.boundary);

  // Degenerate boundary (no extent) → nothing to scatter into.
  if (!Number.isFinite(bbox.minLng) || bbox.maxLng <= bbox.minLng) return [];

  const reports: NormalizedReport[] = [];
  for (let i = 0; i < count; i++) {
    // Recency curve: u^1.6 front-loads activity toward the present.
    const ageDays = Math.max(0.05, rng() ** 1.6 * spanDays);
    const createdMs = now - ageDays * DAY_MS;

    const category = pickWeighted(CATEGORY_WEIGHTS, rng());
    const severity = pickWeighted(SEVERITY_WEIGHTS, rng());
    const status = statusForAge(ageDays, rng());

    // Rejection-sample a point inside the boundary (bbox sample → PIP test).
    let lng = (bbox.minLng + bbox.maxLng) / 2;
    let lat = (bbox.minLat + bbox.maxLat) / 2;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = bbox.minLng + rng() * (bbox.maxLng - bbox.minLng);
      const y = bbox.minLat + rng() * (bbox.maxLat - bbox.minLat);
      if (pointInBoundary(x, y, opts.boundary)) {
        lng = x;
        lat = y;
        break;
      }
    }

    const street = STREET_NAMES[Math.floor(rng() * STREET_NAMES.length)];
    const houseNum = 100 + Math.floor(rng() * 900);

    // Closed reports get a realistic resolution time (severity-weighted hours).
    let resolvedAt: string | undefined;
    if (status === "closed") {
      const resolveHours = 12 + severity * 18 + rng() * 24;
      const resolvedMs = createdMs + resolveHours * 3_600_000;
      // Never resolve in the future.
      if (resolvedMs <= now) resolvedAt = new Date(resolvedMs).toISOString();
    }

    reports.push({
      source: "synthetic",
      sourceExternalId: `synthetic-${opts.seed ?? 1}-${i}`,
      location: { lng, lat },
      category,
      severity,
      status,
      createdAt: new Date(createdMs).toISOString(),
      resolvedAt,
      address: `${houseNum} ${street}`,
    });
  }

  return reports;
}
