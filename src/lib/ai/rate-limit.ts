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
 * Best-effort client IP. Priority order (spoof-resistant):
 *   1. x-real-ip       — set by nginx/proxy, not user-controllable
 *   2. cf-connecting-ip — Cloudflare's authoritative client IP
 *   3. LAST entry of x-forwarded-for — outermost proxy appends; harder to spoof
 *      than the first entry, which an attacker controls in their own request headers
 *   4. "unknown"
 */
export function clientIp(req: Request): string {
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
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count < max) {
    existing.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  return { allowed: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
}
