/**
 * Central AI configuration: pure constants + env reads.
 * No side effects, no external imports — safe to import anywhere (client or server).
 */

/** Gemini model used for all classification calls. */
export const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Per-attempt abort timeout for AI calls, in milliseconds.
 * Bounds the synchronous submit path: worst case ≈ (AI_MAX_RETRIES + 1) *
 * AI_TIMEOUT_MS + backoff. At 20s/1-retry that is ≈ 40s, inside typical
 * serverless function limits — the async path is the real fix for scale.
 */
export const AI_TIMEOUT_MS = 20000;

/** Max retry attempts (beyond the first try) for transient AI failures. */
export const AI_MAX_RETRIES = 1;

/** Base backoff delay in milliseconds; grows exponentially per attempt. */
export const AI_RETRY_BASE_MS = 400;

/** Fixed-window rate limit applied to AI endpoints. */
export const AI_RATE_LIMIT = { windowMs: 60000, max: 20 } as const;

/**
 * When "1", classification runs asynchronously (fire-and-forget / background).
 * Default OFF so the demo path stays synchronous and predictable.
 */
export const ASYNC_CLASSIFY = process.env.NEXT_PUBLIC_ASYNC_CLASSIFY === "1";
