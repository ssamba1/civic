import { AI_MAX_RETRIES, AI_RETRY_BASE_MS } from "./config";

interface WithRetryOptions {
  /** Max retry attempts beyond the first try. Default: AI_MAX_RETRIES. */
  retries?: number;
  /** Base backoff delay in ms; grows exponentially per attempt. Default: AI_RETRY_BASE_MS. */
  baseMs?: number;
  /** If set, each attempt aborts after this many ms. */
  timeoutMs?: number;
  /** Decides whether an error is worth retrying. Default: defaultIsRetryable. */
  isRetryable?: (e: unknown) => boolean;
}

/** Extract a lowercased message string from an unknown thrown value. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.toLowerCase();
  if (typeof e === "string") return e.toLowerCase();
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message).toLowerCase();
  }
  return String(e).toLowerCase();
}

/** Pull a numeric status off common error shapes (status / statusCode / response.status). */
function errorStatus(e: unknown): number | undefined {
  if (!e || typeof e !== "object") return undefined;
  const obj = e as Record<string, unknown>;
  const direct = obj.status ?? obj.statusCode ?? obj.code;
  if (typeof direct === "number") return direct;
  const response = obj.response;
  if (response && typeof response === "object") {
    const rs = (response as Record<string, unknown>).status;
    if (typeof rs === "number") return rs;
  }
  return undefined;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Default retry predicate: retries on aborts/timeouts, network errors, and
 * transient server / rate-limit signals (429/500/502/503/504, "overloaded", "rate").
 */
export function defaultIsRetryable(e: unknown): boolean {
  // AbortError (our timeout, or upstream cancellation).
  if (e instanceof Error && e.name === "AbortError") return true;

  const status = errorStatus(e);
  if (status !== undefined && RETRYABLE_STATUSES.has(status)) return true;

  const msg = errorMessage(e);
  if (!msg) return false;

  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up") ||
    msg.includes("overloaded") ||
    msg.includes("rate") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

/**
 * Run `fn` with exponential backoff + jitter and an optional per-attempt timeout.
 *
 * Each attempt receives a fresh AbortSignal. If `timeoutMs` is set, the signal
 * aborts after that many ms (the timer is always cleared in `finally`). On throw,
 * if attempts remain AND the error is retryable, waits `baseMs * 2**attempt` plus
 * a small random jitter before retrying; otherwise the error is rethrown.
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: WithRetryOptions,
): Promise<T> {
  const retries = opts?.retries ?? AI_MAX_RETRIES;
  const baseMs = opts?.baseMs ?? AI_RETRY_BASE_MS;
  const timeoutMs = opts?.timeoutMs;
  const isRetryable = opts?.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  // attempt 0 = first try; attempts 1..retries = retries.
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      return await fn(controller.signal);
    } catch (err) {
      lastError = err;

      const attemptsRemain = attempt < retries;
      if (!attemptsRemain || !isRetryable(err)) {
        throw err;
      }

      const backoff = baseMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * baseMs);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, backoff + jitter),
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  // Unreachable in practice: the loop either returns or throws.
  throw lastError;
}
