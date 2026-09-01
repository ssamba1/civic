import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SCRIPT_HASHES } from "@/lib/csp/inline-scripts";

// Open311 spec-compliant clients append .json/.xml extensions. Rewrite to
// canonical routes before auth/public-route checks so they resolve correctly.
const OPEN311_JSON_REWRITES: [RegExp, string][] = [
  [/^\/api\/open311\/v2\/services\.json$/, "/api/open311/v2/services"],
  [/^\/api\/open311\/v2\/requests\.json$/, "/api/open311/v2/requests"],
  [
    /^\/api\/open311\/v2\/requests\/([^/]+)\.json$/,
    "/api/open311/v2/requests/$1",
  ],
  // Service-definition + token lookup (added with those routes in the sweep).
  [
    /^\/api\/open311\/v2\/services\/([^/]+)\.json$/,
    "/api/open311/v2/services/$1",
  ],
  [/^\/api\/open311\/v2\/tokens\/([^/]+)\.json$/, "/api/open311/v2/tokens/$1"],
];

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/report",
  "/offline",
  // Native offline delivery authenticates inside the route with a Supabase
  // bearer token rather than a browser cookie.
  "/api/reports/sync",
];

const PUBLIC_PREFIXES = [
  "/city/",
  "/api/open311/",
  "/api/health",
  "/_next/",
  "/icons/",
];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Route prefixes that are GUARANTEED per-request dynamic (auth/cookies/DB in
 * their tree — `next build` marks them ƒ). Only these get the per-request
 * nonce + 'strict-dynamic' CSP. Everything else — including anything Next
 * might prerender (○/●) — gets the nonce-FREE policy: prerendered HTML is
 * baked with no nonce, so a nonce CSP would block every inline script in the
 * cached page (Next's own flight-data scripts included) — the classic
 * dev-invisible, prod-only blank page.
 *
 * The default is deliberately the SAFE direction: a dynamic route mistakenly
 * left off this list merely runs under the slightly weaker no-nonce policy;
 * a prerendered route mistakenly ON a nonce policy ships broken HTML.
 */
const NONCE_CSP_PREFIXES = ["/user", "/admin", "/onboard", "/r"];

function isNonceCspRoute(pathname: string): boolean {
  return NONCE_CSP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Build the Content-Security-Policy. This lives in the proxy (not next.config
 * `headers()`) because a strong CSP for the App Router needs a PER-REQUEST nonce
 * on dynamic routes: Next streams its RSC payload and bootstraps hydration
 * through INLINE <script> tags. A static `script-src 'self'` (no nonce, no
 * 'unsafe-inline') makes the browser refuse every inline script, so the client
 * never hydrates and any client-only subtree (e.g. the WebGL map) never mounts
 * — a blank page in prod while `next dev` appears fine. See
 * https://nextjs.org/docs (CSP guide).
 *
 * Dev keeps the original permissive script-src ('unsafe-inline' 'unsafe-eval',
 * no nonce) so Turbopack Fast Refresh is unaffected. Prod dynamic routes use
 * nonce + 'strict-dynamic' (Next stamps the nonce onto its own scripts) plus
 * the SHA-256 hashes of the app's two constant inline scripts (theme-init +
 * SW-register — see lib/csp/inline-scripts.ts), which is what lets the root
 * layout skip headers() and static routes prerender at all.
 */
function buildCsp(nonce: string, isDev: boolean, useNonce: boolean): string {
  // Cesium compiles WebAssembly (draco / basis decoders) at runtime, which the
  // CSP counts as evaluating script. 'wasm-unsafe-eval' permits exactly that
  // and nothing else — it does NOT re-enable eval() for JavaScript, so it is
  // the narrow grant, not a loosening back to 'unsafe-eval'. Without it the
  // globe throws CompileError on every decoder and falls back to MapLibre.
  const WASM = "'wasm-unsafe-eval'";
  // Cesium's TaskProcessor pool bootstraps each worker from a blob: URL and
  // then calls importScripts() on a second blob: URL. A blob worker inherits
  // the creating document's policy, and importScripts is checked against
  // script-src — not worker-src — so `worker-src blob:` alone lets the worker
  // start and then blocks its bootstrap. The failure is silent in the network
  // panel (nothing is ever requested) and surfaces only as a worker pageerror,
  // which is why the globe rendered its pins while every decoder was dead.
  const BLOB = "blob:";
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${BLOB}`
    : useNonce
      ? `script-src 'self' 'nonce-${nonce}' ${SCRIPT_HASHES.themeInit} ${SCRIPT_HASHES.swRegister} 'strict-dynamic' ${WASM} ${BLOB}`
      : `script-src 'self' 'unsafe-inline' ${WASM} ${BLOB}`;

  return [
    "default-src 'self'",
    scriptSrc,
    // Keep 'unsafe-inline' for styles: maplibre-gl, deck.gl, and React's
    // `style={{…}}` attributes all set inline styles, which a nonce cannot cover.
    "style-src 'self' 'unsafe-inline'",
    // picsum.photos (and its fastly redirect target) host seed/demo report
    // photos; production photos come from *.supabase.co storage. blob: covers
    // maplibre canvas/tile blobs.
    "img-src 'self' data: blob: https://*.supabase.co https://*.openstreetmap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://picsum.photos https://fastly.picsum.photos https://assets.ion.cesium.com",
    "font-src 'self'",
    // Clip playback: the video theater streams signed mp4s straight from the
    // private supabase bucket. Without this, media falls back to default-src
    // 'self' and the <video> fails with MEDIA_ELEMENT_ERROR code 4.
    "media-src 'self' blob: https://*.supabase.co",
    // data: — deck.gl's IconLayer fetch()es the SVG pin icons generated as
    // data: URLs by components/map/pin-icons.ts; fetch is governed by
    // connect-src (img-src data: does not cover it). data: here adds no
    // network destination — it only lets the page read its own inline URIs.
    // Cesium globe: api.cesium.com resolves ion asset endpoints + tokens;
    // assets.ion.cesium.com serves the World Terrain heightmaps and the OSM
    // Buildings 3D tileset. Both are only hit when NEXT_PUBLIC_CESIUM_ION_TOKEN
    // is set; the keyless globe uses the carto/arcgis hosts already listed.
    "connect-src 'self' data: https://*.supabase.co wss://*.supabase.co https://*.openstreetmap.org https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://*.sentry.io https://generativelanguage.googleapis.com https://api.cesium.com https://assets.ion.cesium.com",
    // maplibre-gl parses vector tiles in a Web Worker created from a blob URL;
    // Cesium spawns its own worker pool from /cesium/Workers the same way.
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Rewrite Open311 .json extension URLs to canonical paths (spec §2.1 format suffix)
  for (const [pattern, replacement] of OPEN311_JSON_REWRITES) {
    const match = request.nextUrl.pathname.match(pattern);
    if (match) {
      const url = request.nextUrl.clone();
      url.pathname = match[1]
        ? replacement.replace("$1", match[1])
        : replacement;
      return NextResponse.rewrite(url);
    }
  }

  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";
  const useNonce = isNonceCspRoute(pathname);
  // btoa (not Buffer) so this runs identically in the Edge runtime Vercel uses
  // for middleware/proxy — Buffer is a Node global and may be absent on edge.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, isDev, useNonce);

  // Clone the *current* request headers and inject the nonce. Setting the CSP on
  // the request headers is what makes Next apply the nonce to its inline scripts
  // on nonce-CSP routes; every other route gets no nonce (its HTML may be
  // prerendered and must not depend on a per-request value). Re-reading
  // request.headers each call preserves any cookies Supabase refreshed below.
  // The matching response header is what the browser actually enforces.
  const reqHeaders = () => {
    const h = new Headers(request.headers);
    if (useNonce) {
      h.set("x-nonce", nonce);
      h.set("Content-Security-Policy", csp);
    }
    return h;
  };

  // Dev fast path: auth gating is disabled in development, so the per-request
  // Supabase getUser() round-trip is pure overhead on every navigation. Skip it
  // and just attach the (permissive) dev CSP.
  if (isDev) {
    const response = NextResponse.next({ request: { headers: reqHeaders() } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Always create the Supabase client and call getUser() so the auth session
  // cookies refresh on every request — including public routes — otherwise
  // sessions expire silently.
  let response = NextResponse.next({ request: { headers: reqHeaders() } });

  const supabase = createServerClient(
    // biome-ignore lint/style/noNonNullAssertion: required NEXT_PUBLIC_* env, validated by clientEnvSchema in lib/env.ts
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: required NEXT_PUBLIC_* env, validated by clientEnvSchema in lib/env.ts
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: reqHeaders() } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() refreshes the session cookie as a side effect. Must run before any
  // early return so public-route visitors keep their sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow public routes through — return `response` so refreshed cookies + the
  // CSP header reach the browser.
  if (isPublicRoute(pathname)) {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Protected: /admin/* — require admin role.
  if (pathname.startsWith("/admin/")) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirect = NextResponse.redirect(loginUrl);
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }

    // Read role ONLY from app_metadata (server-writable via the Supabase Admin
    // API). Never trust user_metadata — any authenticated user can write it via
    // supabase.auth.updateUser() and self-promote to admin.
    const role = user.app_metadata?.role;
    if (role !== "admin") {
      const redirect = NextResponse.redirect(new URL("/teams", request.url));
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and images.
     * Next.js internals (_next/static, _next/image, favicon) are excluded.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
