import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Pin the workspace root to THIS directory.
  //
  // Next infers the root by walking up for lockfiles, and a stray
  // package-lock.json in a parent directory (a home directory, a monorepo you
  // are nested inside) wins over this project's own pnpm workspace. The
  // inferred root then decides where standalone output is written: with the
  // wrong root the entry point lands at `.next/standalone/<projectDir>/server.js`
  // instead of `.next/standalone/server.js`, and `pnpm start:prod` — which is
  // the documented way to run this in production — fails with MODULE_NOT_FOUND.
  // `prod:assets` copies static and public to the wrong place for the same
  // reason, so even correcting the path by hand serves an unstyled app.
  //
  // Next warns about the ambiguity on every build. The warning is the whole
  // bug; pinning the root is the fix.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
  },

  experimental: {
    turbopackFileSystemCacheForDev: true,
    // Every route is force-dynamic (per-request CSP nonce, see app/layout.tsx),
    // so the client Router Cache's default dynamic staleTime of 0 refetches the
    // RSC payload on every in-app navigation — re-flashing each route's
    // loading.tsx skeleton even after the page already loaded once. Hold visited
    // dynamic segments fresh for 30s so revisits reuse the cache instead.
    staleTimes: {
      dynamic: 30,
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Seed/demo report photos are served from picsum (and its fastly target).
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },

  // Sentry wraps the config at build time via withSentryConfig;
  // keep sentry-specific keys here for the wrapper to pick up.
  serverExternalPackages: ["@sentry/nextjs"],

  // NOTE: Content-Security-Policy is NOT set here. It needs a per-request nonce
  // for the App Router's inline hydration scripts, which static config headers
  // can't provide — it lives in `src/proxy.ts` instead. Setting a (nonce-less)
  // CSP here too would emit a second, conflicting header. The remaining headers
  // below are request-independent, so they stay.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=()",
          },
          {
            // 2 years — minimum for HSTS preload list submission
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

// Only wrap with Sentry for production builds. In dev the wrapper adds compile
// overhead and emits deprecation warnings for options Turbopack ignores, while
// Sentry.init is DSN-gated off locally anyway — so skip it entirely for `next dev`.
export default process.env.NODE_ENV === "production"
  ? withSentryConfig(nextConfig, {
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // NOTE: `disableLogger: true` used to sit here to strip Sentry's debug
      // logging from the production client bundle. It did nothing and said so
      // — every build printed, twice:
      //
      //   [@sentry/nextjs] DEPRECATION WARNING: disableLogger is deprecated and
      //   will be removed in a future version. Use
      //   webpack.treeshake.removeDebugLogging instead. (Not supported with
      //   Turbopack.)
      //
      // Next 16 builds this app with Turbopack (`next build` reports
      // "Next.js 16.2.12 (Turbopack)"), and the named replacement is a webpack
      // option, so there is no Turbopack equivalent to migrate to. Keeping a
      // deprecated no-op only to emit a warning that trains people to ignore
      // build output is worse than carrying the few KB of debug strings, so
      // the option is gone rather than swapped.
    })
  : nextConfig;
