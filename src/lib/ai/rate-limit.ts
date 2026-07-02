// In-memory fixed-window rate limiter. The window state lives in a module-level
// Map and resets on cold start (serverless) — counters are per-instance, so under
// multi-instance scale the effective limit is (instances * max). For real
// distributed limiting, swap this Map for Upstash/Redis with an atomic INCR + TTL.

import { AI_RATE_LIMIT } from "./config";

interface WindowState {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs?: number;
  max?: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const windows = new Map<string, WindowState>();

/**
 * Client IP used as the rate-limit key.
 *
 * When RATE_LIMIT_TRUSTED_HEADER is set, ONLY that header is read — point it at
 * the platform-set header your infra guarantees (e.g. "x-real-ip" on
 * Vercel/nginx), which the client cannot forge. This is the correct, spoof-safe
 * mode for production.
 *
 * When it is unset (local/dev, or a deploy that hasn't configured it) we fall
 * back to the previous best-effort order. That fallback is only as trustworthy
 * as your proxy: a reverse proxy that does NOT strip client-supplied
 * x-real-ip / x-forwarded-for lets an attacker rotate the key and evade the
 * limiter — so set RATE_LIMIT_TRUSTED_HEADER in any real deployment.
 */
export function clientIp(req: Request): string {
  // Read process.env directly (not the validated serverEnv proxy): this runs on
  // every AI request and must never throw, and the limiter has no reason to
  // force full server-env validation. Declared in env.ts for documentation.
  const trustedHeader = process.env.RATE_LIMIT_TRUSTED_HEADER?.trim();
  if (trustedHeader) {
    return req.headers.get(trustedHeader)?.trim() || "unknown";
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",");
    const last = entries[entries.length - 1]?.trim();
    if (last) return last;
  }

  return "unknown";
}

// Cap on distinct keys retained in memory. Prevents the windows Map from growing
// unbounded on a long-lived server (one entry per unique IP forever). A full
// sweep of expired entries runs when this threshold is crossed; if everything is
// still live, the oldest-resetting entries are evicted.
const MAX_TRACKED_KEYS = 10_000;

function pruneWindows(now: number): void {
  if (windows.size < MAX_TRACKED_KEYS) return;
  for (const [key, state] of windows) {
    if (now >= state.resetAt) windows.delete(key);
  }
  if (windows.size < MAX_TRACKED_KEYS) return;
  // Still over budget with all windows live: evict soonest-to-reset entries.
  const sorted = [...windows.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt,
  );
  const drop = windows.size - MAX_TRACKED_KEYS;
  for (let i = 0; i < drop; i++) windows.delete(sorted[i][0]);
}

/**
 * Fixed-window counter keyed by `key`. Returns whether the call is allowed and,
 * when blocked, how long until the current window resets.
 */
export function checkRateLimit(
  key: string,
  cfg?: RateLimitConfig,
): RateLimitResult {
  const windowMs = cfg?.windowMs ?? AI_RATE_LIMIT.windowMs;
  const max = cfg?.max ?? AI_RATE_LIMIT.max;
  const now = Date.now();

  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    pruneWindows(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count < max) {
    existing.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  return { allowed: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
}
