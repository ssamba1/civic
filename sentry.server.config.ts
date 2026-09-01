import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Which deployment produced this event. Without it every environment that
    // points at the same DSN — local `pnpm prod`, the demo build, the live
    // `civic-testing` build — files into one undifferentiated stream, so an
    // alert cannot tell "a resident's report failed in production" from
    // "someone was poking at a seeded demo", and neither can a release
    // comparison. SENTRY_ENVIRONMENT overrides; NODE_ENV is the sane default
    // and is always set by `next build` / `next start`.
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
