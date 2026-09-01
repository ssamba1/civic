/* ==================================================================
   The app's OWN inline scripts + their CSP hashes.

   Single source of truth shared by the root layout (which renders the
   scripts) and proxy.ts (which allowlists them in script-src). Both are
   build-time constants, so a SHA-256 hash covers them permanently and no
   per-request nonce is needed for them, which is what lets the root
   layout stop calling headers() and lets static-capable routes prerender
   (REVAMP_PLAN 2.5).

   HASH DRIFT GUARD: inline-scripts.test.ts recomputes both hashes from
   the source strings. Any edit to a script (even whitespace) fails the
   suite until the matching SCRIPT_HASHES entry is updated. Regenerate
   with:  node -e "console.log(require('crypto').createHash('sha256')
     .update(SCRIPT).digest('base64'))"

   Edge-safe: no Node imports. Proxy.ts runs on the edge runtime.
   ================================================================== */

// No-flash theme init. Runs synchronously before the body paints, so the
// correct theme class is on <html> from the first frame. Default is light
// (matches the server-rendered markup, no `dark` class → zero flash for the
// common case); only a stored "dark" preference adds it. Kept tiny +
// dependency-free; the React store (lib/theme.ts) takes over after hydration.
export const THEME_INIT = `(function(){try{var t=localStorage.getItem('civic.theme');if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

// Registers public/sw.js (precache + offline fallback, see that file) once the
// page has finished loading, so registration never competes with the initial
// paint. PRODUCTION ONLY: sw.js serves /_next/static/ and *.js cache-first,
// which is safe in prod (chunks are content-hashed, immutable) but poison in
// dev. Turbopack keeps chunk names stable across edits, so a dev browser that
// ever installed the SW replays its first-cached bundle through every reload
// and silently ignores all later code changes. Dev therefore injects the
// inverse: unregister any worker and delete its caches, self-healing browsers
// that already latched a stale one.
export const SW_REGISTER = `(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}})();`;
export const SW_CLEANUP = `(function(){if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(window.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k);});}).catch(function(){});}})();`;

/** sha256-base64 of THEME_INIT + SW_REGISTER, as CSP source expressions.
 *  Only the prod pair is hashed, dev CSP allows 'unsafe-inline' anyway. */
export const SCRIPT_HASHES = {
  themeInit: "'sha256-3iT3WqKKZQ2bYUsIgQ1Kv3zmvrwnmmWKTuJHz5amE98='",
  swRegister: "'sha256-QY4HAPfWMl/mr6Y4dUm8FZcgloKphAwf+QMzfpcIvnI='",
} as const;
