import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

  async headers() {
    const isDev = process.env.NODE_ENV === "development";

    const cspDirectives = [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // picsum.photos (and its fastly redirect target) host the seed/demo
      // report photos; production photos come from *.supabase.co storage.
      "img-src 'self' data: blob: https://*.supabase.co https://*.openstreetmap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://picsum.photos https://fastly.picsum.photos",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.openstreetmap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://*.sentry.io https://generativelanguage.googleapis.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ];

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspDirectives.join("; "),
          },
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
