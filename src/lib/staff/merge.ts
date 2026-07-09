/**
 * Staff duplicate-merge scoring (pure — no I/O, no imports from outside lib).
 *
 * Scoring components for a pair of reports (all in [0, 1]):
 *   40% location  — proximity; 0 at ≥ 500 m, 1 at 0 m (linear decay)
 *   30% visual    — phash Hamming distance over 64 bits; 0.5 when hash absent
 *   20% category  — 1 exact match, 0 mismatch, 0.5 when either unknown
 *   10% time      — closer in time = higher; 0 at ≥ 90 days, 1 at same moment
 *
 * Co-located tests: merge.test.ts
 */

import type { Result } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportForMerge {
  id: string;
  city_id: string;
  /** Distance in metres from the target report (populated by DB query). */
  distance_m: number;
  photo_phash: string | null;
  category: string | null;
  address: string | null;
  created_at: string; // ISO 8601
  /** Set when this report has already been merged into another. */
  merged_into: string | null;
  status: string;
}

export interface ScoredCandidate extends ReportForMerge {
  /** Composite similarity score in [0, 1]. Higher = more likely duplicate. */
  score: number;
  /** Breakdown for UI tooltip display. */
  score_breakdown: {
    location: number;
    visual: number;
    category: number;
    time: number;
  };
}

// ─── Hamming distance (nibble-table approach, same as report/actions.ts) ──────

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

/**
 * Hamming distance between two hex-encoded perceptual hashes.
 * Returns number of differing bits (0..64 for 16-char strings).
 */
export function hammingDistance(a: string, b: string): number {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const nibbleA = parseInt(a[i], 16);
    const nibbleB = parseInt(b[i], 16);
    if (!Number.isNaN(nibbleA) && !Number.isNaN(nibbleB)) {
      dist += NIBBLE_BITS[nibbleA ^ nibbleB];
    }
  }
  return dist;
}

// ─── Individual scoring components ────────────────────────────────────────────

/** Location score: 1 at 0 m, 0 at ≥ MAX_DISTANCE_M. */
const MAX_DISTANCE_M = 500;
export function locationScore(distanceM: number): number {
  return Math.max(0, 1 - distanceM / MAX_DISTANCE_M);
}

/** Visual score: phash Hamming similarity over 64 bits. 0.5 if hash absent. */
export function visualScore(
  phashA: string | null,
  phashB: string | null,
): number {
  if (!phashA || !phashB) return 0.5;
  const dist = hammingDistance(phashA, phashB);
  return Math.max(0, 1 - dist / 64);
}

/** Category score: 1 exact, 0 mismatch, 0.5 unknown. */
export function categoryScore(
  catA: string | null,
  catB: string | null,
): number {
  if (!catA || !catB) return 0.5;
  return catA === catB ? 1 : 0;
}

/** Time score: 1 at same moment, 0 at ≥ MAX_AGE_DIFF_DAYS days apart. */
const MAX_AGE_DIFF_DAYS = 90;
export function timeScore(createdAtA: string, createdAtB: string): number {
  const diffMs = Math.abs(
    new Date(createdAtA).getTime() - new Date(createdAtB).getTime(),
  );
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - diffDays / MAX_AGE_DIFF_DAYS);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a composite similarity score (0..1) for a candidate report relative
 * to a target report. Higher score = more likely to be a duplicate.
 *
 * Weights: 40% location + 30% visual + 20% category + 10% time.
 */
export function scoreDuplicatePair(
  target: Pick<ReportForMerge, "photo_phash" | "category" | "created_at">,
  candidate: ReportForMerge,
): ScoredCandidate {
  const loc = locationScore(candidate.distance_m);
  const vis = visualScore(target.photo_phash, candidate.photo_phash);
  const cat = categoryScore(target.category, candidate.category);
  const tim = timeScore(target.created_at, candidate.created_at);

  const score = 0.4 * loc + 0.3 * vis + 0.2 * cat + 0.1 * tim;

  return {
    ...candidate,
    score: Math.round(score * 1000) / 1000,
    score_breakdown: {
      location: Math.round(loc * 1000) / 1000,
      visual: Math.round(vis * 1000) / 1000,
      category: Math.round(cat * 1000) / 1000,
      time: Math.round(tim * 1000) / 1000,
    },
  };
}

/**
 * Rank a list of candidates by descending similarity to the target.
 * Mutates nothing; returns a new sorted array.
 */
export function rankDuplicateCandidates(
  target: Pick<ReportForMerge, "photo_phash" | "category" | "created_at">,
  candidates: ReportForMerge[],
): ScoredCandidate[] {
  return candidates
    .map((c) => scoreDuplicatePair(target, c))
    .sort((a, b) => b.score - a.score);
}

/**
 * Guard that returns an error Result when a merge is not allowed.
 *
 * Rules:
 *  - Cannot merge a report into itself.
 *  - Cannot merge a report that is already merged (merged_into != null or status='merged').
 *  - Cannot use an already-merged report as the canonical target.
 *  - Both reports must belong to the same city.
 */
export function canMerge(
  canonical: Pick<ReportForMerge, "id" | "city_id" | "merged_into" | "status">,
  merged: Pick<ReportForMerge, "id" | "city_id" | "merged_into" | "status">,
): Result<true> {
  if (canonical.id === merged.id) {
    return { ok: false, error: "cannot_merge_self" };
  }
  if (merged.merged_into !== null || merged.status === "merged") {
    return { ok: false, error: "already_merged" };
  }
  if (canonical.merged_into !== null || canonical.status === "merged") {
    return { ok: false, error: "canonical_already_merged" };
  }
  if (canonical.city_id !== merged.city_id) {
    return { ok: false, error: "different_cities" };
  }
  return { ok: true, data: true };
}
