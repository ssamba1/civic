/* ==================================================================
   Trending-issues ranking (NEXT_100 #86).

   Public, auth-free. Score = upvotes weighted by recency using a
   time-decay half-life of 72 h (older issues fade, but not to zero —
   an issue with 50 upvotes still beats one with 2 upvotes filed
   yesterday, just by less). Pure functions so they can be tested and
   run on any runtime (edge or Node).
   ================================================================== */

const HALF_LIFE_MS = 72 * 60 * 60 * 1000; // 72 h in ms

export interface TrendableReport {
  id: string;
  created_at: string;
  /** Upvote count already resolved by the caller. */
  upvotes: number;
}

/**
 * Recency-weighted score for one report.
 * score = upvotes × e^(−age / half_life)
 *
 * This keeps fresh issues surfaced even with few votes while old
 * high-vote reports still appear — they just rank slightly lower.
 * A floor of 0 is applied so negative values are impossible.
 */
export function scoreTrending(
  report: TrendableReport,
  now: Date | number = new Date(),
): number {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ageMs = Math.max(0, nowMs - new Date(report.created_at).getTime());
  const decay = Math.exp(-ageMs / HALF_LIFE_MS);
  return Math.max(0, report.upvotes * decay);
}

/**
 * Sort `reports` by trending score descending. Returns a new array;
 * ties broken by most recent `created_at`.
 */
export function rankTrending<T extends TrendableReport>(
  reports: T[],
  now: Date | number = new Date(),
): T[] {
  const scored = reports.map((r) => ({ report: r, score: scoreTrending(r, now) }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(b.report.created_at) - Date.parse(a.report.created_at),
  );
  return scored.map((s) => s.report);
}
