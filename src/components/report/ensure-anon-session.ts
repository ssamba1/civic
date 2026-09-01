"use client";

import { createBrowserSupabase } from "@/lib/db/browser-client";

type BrowserSupabase = ReturnType<typeof createBrowserSupabase>;

export type EnsureSessionResult =
  | { ok: true }
  | { ok: false; error: string; rateLimited: boolean };

// One in-flight bootstrap shared across every caller (the /report mount effect,
// the submit guard, AnonBootstrap on /user). A fresh visitor used to fire a
// separate anonymous signup from each mount point; on the shared Supabase
// project those signups race straight into the signup rate limit (HTTP 429).
// Deduping to a single promise means at most one signup is ever in flight.
let inflight: Promise<EnsureSessionResult> | null = null;

const MAX_ATTEMPTS = 4;
// 0.8s, 1.6s, 3.2s between the 4 attempts, spaces retries out instead of
// hammering a rate-limited endpoint, which only pushes the limit further out.
const BASE_DELAY_MS = 800;

const RATE_LIMIT_MESSAGE =
  "Too many attempts right now. Please wait about a minute, then try again.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// supabase-js returns auth failures in-band as an AuthError with an HTTP
// `status`; 429 is the signup rate limit. Message-sniff as a backstop for
// gateways that drop the numeric status.
function isRateLimit(status: number | undefined, message: string): boolean {
  if (status === 429) return true;
  const m = message.toLowerCase();
  return m.includes("rate limit") || m.includes("too many");
}

async function bootstrap(
  supabase: BrowserSupabase,
): Promise<EnsureSessionResult> {
  // Reuse a persisted session first. The @supabase/ssr browser client restores
  // it from cookies/localStorage, so a returning visitor (or a second mount in
  // the same visit) never signs up again. This is the core of the fix.
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) return { ok: true };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { error } = await supabase.auth.signInAnonymously();
    if (!error) return { ok: true };

    if (!isRateLimit(error.status, error.message)) {
      // Offline / config / other non-429 failure. Retrying quickly won't help.
      return {
        ok: false,
        error:
          "Could not start a session. Check your connection and try again.",
        rateLimited: false,
      };
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(BASE_DELAY_MS * 2 ** attempt);
    }
  }
  return { ok: false, error: RATE_LIMIT_MESSAGE, rateLimited: true };
}

/**
 * Ensure a Supabase session exists for the current visitor, reusing a persisted
 * one when present and otherwise minting an anonymous guest session with
 * exponential backoff on the signup rate limit. Concurrent callers share a
 * single in-flight attempt. Returns a tagged result so callers can surface an
 * honest, specific error instead of silently no-op'ing a submit.
 */
export function ensureAnonSession(
  supabase: BrowserSupabase = createBrowserSupabase(),
): Promise<EnsureSessionResult> {
  if (inflight) return inflight;
  inflight = bootstrap(supabase).finally(() => {
    inflight = null;
  });
  return inflight;
}
