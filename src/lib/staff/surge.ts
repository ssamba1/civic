/**
 * Storm/emergency surge reprioritisation (NEXT_100 #63).
 *
 * Pure module — no I/O, no DB, no Next.js dependencies.
 * The server action layer (src/app/staff/surge-actions.ts) handles persistence.
 *
 * Co-located tests: surge.test.ts
 */

import type { ReportCategory, ReportStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A minimal report shape the reprioritiser operates on. */
export interface SurgeReport {
  id: string;
  status: ReportStatus;
  category: ReportCategory;
  /** Current computed priority score (higher = more urgent). */
  priority_score: number;
  /** City/geo identifier used to match `surgeConfig.city_id`. */
  city_id: string;
  /** Created ISO string — used as tiebreaker. */
  created_at: string;
}

/** Boost applied to a report by the surge engine. */
export interface SurgeBoost {
  /** Original priority_score before boost. */
  original_priority_score: number;
  /** Boosted priority_score. */
  boosted_priority_score: number;
}

/** A report annotated with optional surge-boost metadata. */
export type ReportWithSurge = SurgeReport & {
  surgeBoost?: SurgeBoost;
};

/** Persistent surge state, written by the server action to DB. */
export interface SurgeConfig {
  /** City this surge applies to; null = all cities (city-wide override). */
  city_id: string | null;
  /** Whether surge mode is currently active. */
  active: boolean;
  /** Categories that should be surge-boosted (e.g. ["tree_down","drainage"]). */
  categories: ReportCategory[];
  /** Human-readable reason for activating surge (stored for audit trail). */
  reason: string;
  /** ISO timestamp when surge was activated. */
  activated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Multiplier applied to the priority_score of matching open reports.
 * 2× keeps the boosted items clearly ahead of normal priority without
 * artificially inflating scores to astronomical values.
 */
const SURGE_MULTIPLIER = 2;

/**
 * Statuses that are eligible for surge reprioritisation.
 * Closed/rejected/merged reports aren't in the active backlog.
 */
const ELIGIBLE_STATUSES: ReadonlySet<ReportStatus> = new Set([
  "open",
  "dispatched",
  "in_progress",
]);

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Reprioritise `reports` given an active `surgeConfig`.
 *
 * Matching criteria:
 *   - `surgeConfig.active` must be true
 *   - Report city_id must match `surgeConfig.city_id` (or config city is null = all)
 *   - Report category must be in `surgeConfig.categories`
 *   - Report status must be open/dispatched/in_progress
 *
 * Returns the full list re-sorted by boosted priority_score descending.
 * Non-matching reports are returned unchanged.
 * When surge is inactive, returns the original list unchanged (no-op).
 *
 * @param reports - Full list of reports (may include any status/city).
 * @param surgeConfig - Current surge configuration.
 * @param now - Current timestamp (ISO string); reserved for future time-window checks.
 */
export function reprioritize(
  reports: SurgeReport[],
  surgeConfig: SurgeConfig,
  _now: string = new Date().toISOString(),
): ReportWithSurge[] {
  if (!surgeConfig.active || surgeConfig.categories.length === 0) {
    // Surge inactive — return as-is, typed correctly.
    return reports as ReportWithSurge[];
  }

  const categorySet = new Set(surgeConfig.categories);

  const annotated: ReportWithSurge[] = reports.map((r) => {
    const cityMatch =
      surgeConfig.city_id === null || r.city_id === surgeConfig.city_id;
    const eligible =
      cityMatch &&
      ELIGIBLE_STATUSES.has(r.status) &&
      categorySet.has(r.category);

    if (!eligible) return r;

    const boosted = r.priority_score * SURGE_MULTIPLIER;
    return {
      ...r,
      priority_score: boosted,
      surgeBoost: {
        original_priority_score: r.priority_score,
        boosted_priority_score: boosted,
      },
    };
  });

  // Re-sort: boosted priority descending, then by created_at ascending as tiebreaker.
  annotated.sort((a, b) => {
    const diff = b.priority_score - a.priority_score;
    if (diff !== 0) return diff;
    return a.created_at < b.created_at
      ? -1
      : a.created_at > b.created_at
        ? 1
        : 0;
  });

  return annotated;
}
