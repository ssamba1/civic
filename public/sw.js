// v3: purge older caches on activate — v1/v2 were installed by dev browsers (dev
// now unregisters instead of registering, see layout.tsx) and cached non-hashed
// dev chunks cache-first, freezing those browsers on stale bundles. Bumping the
// version forces already-frozen browsers to drop the stale cache on SW update.
const CACHE_NAME = "civic-v3";
const STATIC_ASSETS = ["/", "/offline", "/manifest.json"];

// Install: pre-cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Only responses worth keeping. `cache.put` stores whatever it is handed —
// including a 404, a 500, a 30x, and an opaque cross-origin response whose
// status is unreadable (always 0). Storing any of those is how a cache-first
// entry becomes permanent: nothing ever re-fetches it, because a cached error
// page is still a cache hit. A single deploy window where a hashed chunk
// briefly 404s is enough to pin that 404 for the life of the cache version.
//
// `type === "basic"` restricts this to same-origin responses. Cross-origin
// assets (fonts, the picsum seed photos) come back opaque, so we cannot tell a
// success from a failure and simply do not store them.
function isCacheable(response) {
  return response && response.ok && response.type === "basic";
}

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Dev safety: on localhost, Turbopack keeps chunk/CSS URLs stable across edits,
  // so cache-first would replay a frozen bundle and hide every later change. A
  // leftover SW from a past prod build on :3000 must not do that — always go to
  // the network here (fall back to cache only when offline). Production hosts are
  // never localhost, so this never affects the deployed PWA.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Never cache API / admin routes — may contain authed user data
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin/")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ico)$/) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (isCacheable(response)) {
              const clone = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Field-crew view (#52): network-first, but STORE each successful page load
  // and serve the cached page when offline — a crew that loses signal sees the
  // last-synced queue instead of the generic /offline screen. Scoped to the
  // /city/*/team/*/field route so no other authed page is persisted.
  if (/^\/city\/[^/]+\/team\/[^/]+\/field\/?$/.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // A crew that loses signal must get their last GOOD queue, not a
          // cached 500 or the login redirect their expired session produced.
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline"))
        )
    );
    return;
  }

  // Network-first for pages, offline fallback
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) => cached || caches.match("/offline"))
    )
  );
});
