/**
 * Closure quality guard (NEXT_100 #5).
 *
 * Prevents staff from closing work orders with single-word or generic reasons
 * that give residents zero information about what actually happened.
 *
 * Pure module — no I/O, no imports. Co-located tests: closure-quality.test.ts
 */

/** Normalise: lowercase, strip leading/trailing punctuation & whitespace. */
function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

/**
 * Exact-match blocklist for normalised reasons.
 * Add entries here; keep them SHORT (what people actually type).
 */
const GENERIC_EXACT: ReadonlySet<string> = new Set([
  "done",
  "fixed",
  "closed",
  "resolved",
  "complete",
  "completed",
  "na",
  "n/a",
  "ok",
  "okay",
  "yes",
  "noted",
  "seen",
  "checked",
  "confirmed",
  "acknowledged",
  "handled",
  "addressed",
  "taken care of",
  "taken care",
  "will do",
  "see notes",
  "no evidence observed",
  "no issues found",
  "no issue found",
  "no issue detected",
  "nothing found",
  "nothing observed",
  "issue not found",
  "not found",
  "no action required",
  "no action needed",
  "no further action",
  "no action",
  "repaired",
  "repair done",
  "repair complete",
]);

/**
 * Substring/prefix blocklist: normalised reason STARTS WITH one of these.
 * Catches "done, see photos", "fixed it", "resolved - crew notes attached", etc.
 */
const GENERIC_PREFIX: readonly string[] = [
  "done",
  "fixed",
  "closed",
  "resolved",
  "complete",
  "na ",
  "n/a",
  "no evidence",
  "no issue",
  "nothing found",
  "no action",
  "repaired",
];

/** Minimum character count for a non-generic reason (after normalise). */
const MIN_LENGTH = 15;

/**
 * Returns `true` when `reason` is too generic to be a meaningful closure note.
 * Checks:
 *   1. Empty after trim
 *   2. Below minimum length
 *   3. Exact match against the blocklist
 *   4. Starts with a blocklisted generic prefix and contains no additional
 *      detail (length guard prevents "Repaired the 4-inch pothole on Main St"
 *      from being rejected even though it starts with "repaired").
 */
export function isGenericClosure(reason: string): boolean {
  const norm = normalise(reason);
  if (!norm) return true;
  if (norm.length < MIN_LENGTH) {
    // Short strings must be an exact match to be blocked — allow short but
    // specific descriptions like "Crack sealed." (13 chars).  Exact-match the
    // raw short token; prefix check still applies below.
    if (GENERIC_EXACT.has(norm)) return true;
  }
  if (GENERIC_EXACT.has(norm)) return true;
  // Prefix guard: only fire when there's no substantial extra content.
  // "resolved at 3pm after crew cleared debris" → starts with "resolved" but
  // is 40+ chars — pass through.
  if (norm.length <= MIN_LENGTH + 10) {
    for (const prefix of GENERIC_PREFIX) {
      if (norm.startsWith(prefix)) return true;
    }
  }
  return false;
}
