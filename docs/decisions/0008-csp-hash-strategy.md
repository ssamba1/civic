# 0008 — CSP strategy (hashes + selective nonce in the proxy)

- Status: **Accepted** (2026-07-08, documenting the WS4 decision)
- Scope: how the Content-Security-Policy is constructed and applied.

## Context

Next 16's PPR / `cacheComponents` is documented-incompatible with a per-request
nonce CSP (a static shell can't carry a request-scoped nonce). But the app has a
few constant inline scripts (theme init, service-worker register/cleanup) that
must be allowed without opening `unsafe-inline`. The CSP is built in the Next
middleware, which Next 16 exposes as `src/proxy.ts` (not `middleware.ts`).

## Decision

- Build the CSP in `src/proxy.ts` (`buildCsp`). Constant inline scripts are
  allowed by **SHA-256 hash** (computed from the source constants so hash-drift
  is impossible), with `strict-dynamic` propagating trust to Next's chunk loader.
- Routes that genuinely need a per-request nonce (a small `isNonceCspRoute`
  allowlist) still get one; everything else uses the hash path and can be static.
- The proxy also handles the Open311 `.json` rewrites and auth redirects, so all
  edge-level request rewriting lives in one place.

## Alternatives considered

- **Pure nonce CSP**: blocks static rendering / PPR (issue #89754).
- **`unsafe-inline`**: defeats the CSP.
- **A separate `middleware.ts`**: Next 16 uses `proxy.ts`; two entry points
  would conflict.

## Consequences

- Adding a new constant inline script means adding its hash (a prebuild step
  computes hashes from the source constants).
- CSP changes are prod-only breakage, invisible to typecheck/vitest — they need
  a live-browser verification pass (documented with the WS4 checklist).
