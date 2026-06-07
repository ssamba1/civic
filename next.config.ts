import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  experimental: {
    turbopackFileSystemCacheForDev: true,
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
      // Strip Sentry debug logging from the production client bundle.
      disableLogger: true,
    })
  : nextConfig;
