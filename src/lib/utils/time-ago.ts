/* ------------------------------------------------------------------
   Relative-time formatters shared across surfaces.

   `timeAgo` was duplicated in delegation-panel + recent-reports; this
   file is the canonical source. `timeUntil` mirrors the bucket scheme
   for forward deltas (e.g. timeline "est. in 2d" entries).
   ------------------------------------------------------------------ */

/**
 * Past-tense relative time. Clamps negative diffs (clock skew) to 0 so a
 * created_at slightly in the future never renders "-1m".
 *
 * Buckets: <1min → "now"; <60min → "{mins}m"; <24h → "{hrs}h"; else "{days}d".
 */
export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/**
 * Future-tense relative time. For timestamps that are past or now,
 * returns "now". Otherwise prefixes with "est. " so callers don't need
 * to prepend anything.
 *
 * Buckets mirror timeAgo: <1min → "now"; <60min → "est. {mins}m";
 * <24h → "est. {hrs}h"; else "est. {days}d".
 */
export function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `est. ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `est. ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `est. ${days}d`;
}
