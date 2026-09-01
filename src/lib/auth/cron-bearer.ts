import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header against a
 * shared cron secret.
 *
 * Four admin routes accept a shared bearer token so a systemd timer or external
 * cron can drive them headlessly without a staff session:
 *
 *   POST /api/admin/sla-escalate   SLA_CRON_SECRET
 *   POST /api/admin/notify-drain   NOTIFY_CRON_SECRET
 *   GET  /api/admin/drift          DRIFT_CRON_SECRET
 *   GET|POST /api/admin/surge      STORM_CRON_SECRET
 *
 * Each compared its header with `authHeader === \`Bearer ${secret}\``. `===` on
 * strings short-circuits at the first differing byte, so how long the
 * comparison takes leaks how many leading bytes of the guess were right — the
 * standard remotely-measurable oracle for recovering a secret byte by byte.
 * Every other shared secret in this codebase already avoids it: the Open311 API
 * key (safeCompare in that route), INTERNAL_CLASSIFY_SECRET, the inbound SMS
 * signature, and the demo-session cookie HMAC all use timingSafeEqual.
 *
 * These four are the ones worth not leaking. The token they gate is not
 * read-only: sla-escalate rewrites work-order priority and appends to the report
 * timeline, notify-drain re-sends resident email, and surge applies a
 * city-wide priority bump — and each accepts the bearer INSTEAD of a staff
 * session, so the secret alone is full authority over those endpoints.
 *
 * Digest both sides before comparing (same shape as the Open311 helper): the
 * comparison is then always over two 32-byte buffers, so an unequal-length
 * guess takes the same path as an equal-length one and no length oracle
 * remains. timingSafeEqual throws outright on a length mismatch, which is why
 * the raw values cannot be handed to it directly.
 *
 * Fails closed: an unset secret is never a match, so a deployment that has not
 * configured one cannot be driven by an empty or absent header.
 */
export function bearerMatches(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authHeader) return false;
  const presented = createHash("sha256").update(authHeader).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(presented, expected);
}
