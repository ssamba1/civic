/**
 * Cumulative sliding-window rate limiter for Gemini API calls.
 *
 * Tracks all calls globally across the process — not per-user — so total API
 * spend stays bounded regardless of how many concurrent reports are submitted.
 *
 * Three independent windows run in parallel:
 *   per-minute  — burst protection
 *   per-hour    — sustained-load protection
 *   per-day     — hard cost ceiling
 *
 * Limits are read from env vars at first call so they can be tuned per
 * deployment without a code change:
 *   GEMINI_RPM   (default 40)
 *   GEMINI_RPH   (default 300)
 *   GEMINI_RPD   (default 1500)
 *
 * NOTE: State is in-process. For multi-instance deployments (Vercel, etc.)
 * replace the arrays below with an atomic DB counter or Redis INCR.
 */

interface Window {
  timestamps: number[];
  maxMs: number;
}

const minuteWindow: Window = { timestamps: [], maxMs: 60_000 };
const hourWindow: Window = { timestamps: [], maxMs: 3_600_000 };
const dayWindow: Window = { timestamps: [], maxMs: 86_400_000 };

function limit(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function prune(w: Window): void {
  const cutoff = Date.now() - w.maxMs;
  let i = 0;
  while (i < w.timestamps.length && w.timestamps[i] < cutoff) i++;
  if (i > 0) w.timestamps.splice(0, i);
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  reason?: string;
}

/**
 * Call this before every Gemini request.
 * Returns { allowed: true } when under all limits, otherwise { allowed: false, ... }.
 * Recording the call timestamp is included in this function — do not call twice.
 */
export function checkAndRecordGeminiCall(): RateLimitResult {
  const now = Date.now();
  const rpm = limit("GEMINI_RPM", 40);
  const rph = limit("GEMINI_RPH", 300);
  const rpd = limit("GEMINI_RPD", 1500);

  prune(minuteWindow);
  prune(hourWindow);
  prune(dayWindow);

  if (minuteWindow.timestamps.length >= rpm) {
    const retryAfterMs = minuteWindow.timestamps[0] + minuteWindow.maxMs - now;
    return {
      allowed: false,
      retryAfterMs,
      reason: `per-minute limit (${rpm} rpm) exceeded`,
    };
  }
  if (hourWindow.timestamps.length >= rph) {
    const retryAfterMs = hourWindow.timestamps[0] + hourWindow.maxMs - now;
    return {
      allowed: false,
      retryAfterMs,
      reason: `per-hour limit (${rph} rph) exceeded`,
    };
  }
  if (dayWindow.timestamps.length >= rpd) {
    const retryAfterMs = dayWindow.timestamps[0] + dayWindow.maxMs - now;
    return {
      allowed: false,
      retryAfterMs,
      reason: `daily limit (${rpd} rpd) exceeded`,
    };
  }

  minuteWindow.timestamps.push(now);
  hourWindow.timestamps.push(now);
  dayWindow.timestamps.push(now);
  return { allowed: true };
}

/**
 * Read-only stats for health checks or admin dashboards.
 */
export function getGeminiRateLimitStats() {
  prune(minuteWindow);
  prune(hourWindow);
  prune(dayWindow);
  return {
    callsLastMinute: minuteWindow.timestamps.length,
    callsLastHour: hourWindow.timestamps.length,
    callsLastDay: dayWindow.timestamps.length,
    limitPerMinute: limit("GEMINI_RPM", 40),
    limitPerHour: limit("GEMINI_RPH", 300),
    limitPerDay: limit("GEMINI_RPD", 1500),
  };
}
