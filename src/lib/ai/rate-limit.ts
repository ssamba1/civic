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
 * Best-effort client IP: first entry of `x-forwarded-for`, else `x-real-ip`,
 * else "unknown".
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

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
