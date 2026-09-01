import * as Sentry from "@sentry/nextjs";

// Prefer the server-only SENTRY_DSN, exactly as sentry.server.config.ts does,
// and fall back to the public one.
//
// The edge runtime is a SERVER runtime — it is where src/proxy.ts runs, and
// proxy.ts is on the path of every single request in this app (it mints the
// per-request CSP nonce that app/layout.tsx depends on). Reading only
// NEXT_PUBLIC_SENTRY_DSN meant a deployment that set SENTRY_DSN — the
// server-only name, which .env.example presents first and describes as the
// server's own — got no edge reporting at all. A proxy/middleware throw is
// then invisible: the request fails before any instrumented server component
// runs, so nothing else in the stack reports it either.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
