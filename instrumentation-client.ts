import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
  });
}

/**
 * App Router navigation instrumentation.
 *
 * Next.js calls this hook on every client-side route transition, and the SDK
 * has no other way to see one — `Sentry.init` alone only instruments the
 * initial pageload. Without the export, every in-app navigation is invisible:
 * no navigation transaction, and an error thrown on a route the user reached
 * by clicking is attributed to whatever page they first landed on.
 *
 * That matters here more than usual because every route is force-dynamic (per-
 * request CSP nonce, see app/layout.tsx) and the experimental staleTimes cache
 * keeps visited segments client-side — so real sessions are mostly navigations,
 * which is exactly the part that was unreported.
 *
 * `next build` has been asking for this on every run:
 *
 *   [@sentry/nextjs] ACTION REQUIRED: To instrument navigations, the Sentry SDK
 *   requires you to export an `onRouterTransitionStart` hook from your
 *   `instrumentation-client.(js|ts)` file.
 *
 * Exported unconditionally, unlike Sentry.init above: with no DSN the SDK is
 * uninitialised and the capture is a no-op, and Next expects the export to
 * exist either way.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
