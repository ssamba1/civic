# Loop State — Civic / Social Impact

Last run: 2026-07-09 (analytics 036 + stack merge to main)
Branch: `main` — PRs #12→#13→#14→#15 all MERGED.

Verify status (2026-07-09): `typecheck` ✅ · `test` ✅ 652 pass / 63 skip ·
`lint` LF-clean at each tip (biome exit 0). NOTE: `biome check` shows CRLF
false-positives locally after a fresh `git pull` (git re-applies CRLF); CI runs
LF and is authoritative-green. #12/#13 merge CI ran full pipeline (incl build)
green; #14/#15 merge runs registered 0 jobs (concurrency cancellation from 4
rapid merges), not a code failure — content == verified #15 tip.

## 2026-07-09 — analytics theater fixed + stack merged

- **0.5 analytics theater FIXED** — migration `036_analytics_rpcs` (8 SECURITY
  DEFINER per-city aggregate RPCs); `analytics-data.ts` calls them in live mode,
  demo literals kept under DEMO_MODE. Applied via Supabase MCP + verified.
- **DB reconciled** — migrations 024–036 confirmed APPLIED on live (all tables
  present; tracking table stale but DB correct). The old "live DB 8 migrations
  behind" blocker is RESOLVED.
- **Stack merged to main** — the 4 stacked PRs were lint-red (biome format +
  test-mock lint errors, not just CRLF). Fixed bottom-up (format + noThenProperty
  biome-ignores + optional-chaining rewrites, test-only), re-based the stack,
  merged #12→#13→#14→#15. Remote branches deleted.

## Shipped in the backlog sweeps (PRs #12–#15, now merged)

- **PR #12 `feat/backlog-sweep`** — EXIF strip, api-key scopes, SLA due_at +
  escalation, zone routing, a11y focus traps, landing reposition, ADR 0002
  accepted, supercluster, Modal 44px.
- **PR #13 `feat/backlog-sweep-2`** — 30-item plan: Open311 lib/db/blur/derive
  tests, city-config RLS, token + service-definition routes, expected_datetime,
  a11y dot labels, audit:privacy script, dead-code deletion, currency
  formatLocalDate + useCurrency (grid/detail), staff assistant tools,
  cross-jurisdiction routing (migration 034), e2e (open311/submit/dedup/staff).
- **PR (this branch) `feat/backlog-sweep-3`** — 40-item plan: +188 unit tests
  across 15 lib modules; Open311 shared http helpers + `.json` rewrites +
  public-route rate limits; admin/auth route rate limits; CI e2e + audit steps
  + tsx dep; ADRs 0003–0008; 4 runbooks; report-detail currency; seed
  idempotency + --dry-run; eval --mock; this refresh.

Merge order: #12 → #13 → #14 (each stacks on the prior).

## Tier 0 security audit (2026-07-08)

- **0.1 forgeable demo cookie** — FIXED (HMAC-signed, `demo-cookie.ts` +
  `staff-access.ts`; DEMO_MODE + slug gated).
- **0.2 staff mutations lack city scope** — FIXED (`reportInStaffCity`/
  `workOrderInStaffCity` on every action, `staff/actions.ts`).
- **0.3 rate limiter trusts spoofable IP** — FIXED spoofable fallback: prod now
  REQUIRES `RATE_LIMIT_TRUSTED_HEADER` (env validation throws). In-memory
  per-instance state NOT fixed — needs Redis (new dep + owner infra), left as
  documented TODO in `rate-limit.ts`.
- **0.4 unauth AI chat/reasoning** — FIXED (both require `getAuthUser` 401 +
  shared Gemini budget cap).
- **0.5 analytics theater** — FIXED (2026-07-08). Migration `036_analytics_rpcs`
  adds 8 SECURITY DEFINER per-city aggregate RPCs (trend, status-funnel,
  severity, hourly-heatmap, top-locations, category-resolution,
  resolution-distribution, MTTR/SLA, reporter-velocity). `analytics-data.ts`
  rewritten to call them in live mode; demo literals kept under DEMO_MODE
  (synthetic rows carry no completed_at → live MTTR is honestly 0 until real
  work-order closes land). Applied via MCP + verified against Cumming data.
  Widgets degrade to empty (never fabricated) on error.

## High Priority (owner-blocked — cannot be done by the agent)

- **Apply migrations 024–034 to the live DB.** `DATABASE_URL` is owner-held.
  Biggest single apply; run against a shadow DB first (migration-021 drift
  precedent). Everything DB-backed (close-the-loop, routing, upvotes, api_keys,
  crews, crew-types, SLA due_at, zone routing, cross-jurisdiction) no-ops or
  graceful-degrades until applied.
- **Resend env** (`RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`) — resolution email +
  CSAT stay dark until set. See `docs/runbooks/notification-delivery.md`.
- **Golden-set photos** — `tests/golden/images/` empty; `pnpm eval` needs
  labeled photos (or run `pnpm eval --mock` for a harness smoke, no photos).
- **Browser/Lighthouse pass** — cluster-bubble polish + the color-only-dot a11y
  audit want a real browser; the playwright-mcp profile was locked this session.

## Watch List

- CI e2e + audit:privacy steps are gated on `secrets.SUPABASE_TEST_URL` — they
  only run once a test-DB secret is configured (same pattern as RLS tests).
- Migrations authored (032/033/034) are idempotent + RLS-tested but NOT applied
  by the agent — the standing pattern.
- Two `023_*` migrations share a number (cost_prediction, photo_phash); the
  runner sorts lexicographically so both apply — don't reuse numbers.

## Resolved this session

- CI runs typecheck/lint/test/build green; e2e + audit now wired (gated).
- `tsx` added to devDependencies (was only transitive; frozen-lockfile safety).
- Dead `privacy/upload.ts` + `signed-url.ts` deleted; `audit.ts` now live via
  `pnpm audit:privacy`.

---
Run log: 2026-07-08 — three backlog sweeps (PRs #12/#13/#14), ~230 new tests,
639+ passing, typecheck/build green.
