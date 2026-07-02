# Civic — Revamp Plan (impact × criticality)

Generated 2026-07-02 by Fable 5. Synthesis of 6 parallel audits (UI/UX, frontend code, backend/logic, performance, security, product/market) + refreshed knowledge graph (2476 nodes, 4797 edges, 185 communities). Deploy target: Next.js 16 standalone (self-hosted Node), Supabase, Gemini 2.5 Flash.

Legend — **Impact** H/M/L (blast radius × user value), **Effort** S (<½ day) / M (½–2 days) / L (>2 days), **Src** = which audit(s) found it.

> **Deploy-target assumption (load-bearing on ranking):** items 0.3 and 2.13 are ranked **H assuming self-hosted standalone** (`next.config output:standalone`; `start:prod` runs `node .next/standalone/server.js`). If production is actually Vercel, the platform sets `x-real-ip` (not client-spoofable) and 0.3 drops to **M**, 2.13 to **L**. Confirm the deploy target before sequencing Sprint A.

---

## TIER 0 — Ship-blockers (do before ANY paying pilot)

| # | Item | Fix | Impact | Effort | Src |
|---|------|-----|--------|--------|-----|
| 0.1 | **Forgeable `civic_demo_session` cookie grants staff access on LIVE non-demo cities.** Cookie is unsigned; `findDemoAccount(cookie)` returns truthy for any known persona (even `usertest`), no role check, no DEMO_MODE gate. `Cookie: civic_demo_session=admintest` → real work-order data (cost, crew, dept, materials). Works in prod because demo accounts compile in regardless of flag. | Sign cookie (HMAC) or server-side session id; require real role membership in `requireStaffFor()`; short-circuit demo lookup when `!DEMO_MODE`. | H | S | SEC#1, BE |
| 0.2 | **Staff mutations have no city scope.** Any staff user can dispatch/close/reject/override/comment on ANY city's reports & work orders. `getStaffUser` reads `city_id` then never checks it. | Add `city_id` equality guard to every staff action; scope the service-role query by caller's city. | H | M | BE#1 |
| 0.3 | **Rate limiter trusts spoofable IP headers.** `clientIp()` reads `x-real-ip`→`cf-connecting-ip`→last `x-forwarded-for`. Off a header-normalizing proxy, attacker rotates IP per request, defeating every AI + Open311 limit → unbounded Gemini spend. Also in-memory per-instance (dies on redeploy, ×N replicas on self-host). | Trust only the platform-set forwarded header for the actual deploy; move limiter state to Postgres/Redis for durability. | H | S–M | BE, SEC#3 |
| 0.4 | **Unauthenticated AI chat endpoint = direct Gemini cost/DoS.** `/api/ai/chat` has no auth (flag + per-IP limiter only); Gemini budget cap guards classify only, not chat or reasoning. | Require session on chat + reasoning; route all Gemini calls through the shared budget cap. | H | S | SEC#2, BE |
| 0.5 | **Analytics is partly theater in live mode.** `fetchAnalyticsKpis` selects all city reports with no `.limit` (PostgREST truncates at 1000 → wrong KPIs silently); trend/funnel/severity/heatmap widgets return mocks/zeros against live DB, never query it. A pilot city sees fabricated dashboards. | Wire the derivation widgets to real queries; paginate/aggregate server-side; remove synthetic fallbacks in live mode. | H | M | BE#4, MKT |

## TIER 1 — High (correctness, security hardening, core UX)

> **STATUS 2026-07-02 — TIER 1 COMPLETE** (branch `feat/sidebar-shell`, commits `dd5290c`→`b16f54e`). All 15 addressed; 3 were already done at audit-refresh time (1.10 landing focus + 1.14 open-redirect were fixed by the parallel theme session; 1.15's `tests/rls/` partly pre-existed). Verified: `tsc --noEmit` clean, 263 vitest pass / 2 pre-existing fails (classify `raw_response` args-drift + chat-404 timeout, both unrelated) / 15 skipped. Note for T2: 1.13's fix is migration `022`; the plan's "migration 006" reference was stale. 1.5 coarsened only public feed coords (address kept — Open311 consumers expect it). 1.3 forged-field vector is closed via authz + content-keyed cache, but the reasoning route still trusts client-forwarded fields for content (reading real DB fields is a future hardening).

| # | Item | Fix | Impact | Effort | Src |
|---|------|-----|--------|--------|-----|
| 1.1 | **Re-classify of a processed report always fails.** `work_orders.report_id` UNIQUE + plain insert; 2nd pipeline run (retry, staff re-run, concurrent submit+Open311) errors and stamps `classify_status=failed` while classifications upsert already succeeded → divergent state. | Upsert on conflict; make pipeline idempotent. | M | S | BE#6 |
| 1.2 | **`dispatchWorkOrderForReport` flips status on 0-row match.** `.update().eq()` succeeds with count 0 → report marked "dispatched" + notify fires with no work order. | `.select().single()` verify-then-act (matches existing dispatch pattern). | M | S | BE#8, dev-audit H2 |
| 1.3 | **Reasoning route: cache poisoning + no object-authz.** Any authed user triggers live Gemini for arbitrary report UUID; result cached by id only → poisons cached reasoning others see; no invalidation on severity/status change. | Object-level ownership check; key cache by (id, content-hash); invalidate on report change. | M | M | BE#7, SEC#6 |
| 1.4 | **Gemini empty-response crash.** `result.response.text()` unguarded in classify + reasoning; empty Gemini reply throws TypeError instead of hitting the (otherwise excellent) fallback → breaks the demo thread. | `result.response?.text?.() ?? ''` guard. | M | S | dev-audit AI-pipeline (Critical) |
| 1.5 | **Open311 public feed leaks precise PII.** Exact lat/long + full address + photo URL for every non-rejected report; raw-photo protection is detective-only (exact byte-size match — a re-encoded raw of different size passes). | Coarsen public coordinates; prevent raw upload to public bucket (server-side check, not audit-after). | M | M | SEC#4/#5 |
| 1.6 | **Open311 POST self-call breaks in prod.** Classify trigger HTTP-calls `NEXT_PUBLIC_SITE_URL` → localhost:3000 fallback; env unset in prod ⇒ external reports never classified. Also no rate limit on POST; "first active city" fallback has no ORDER BY. | Call pipeline in-process (not HTTP); require the URL env; add limit + deterministic city. | M | S | BE#14 |
| 1.7 | **overrideClassification doesn't regenerate work order + swallows feedback error.** Category change leaves WO routed to OLD department/crew; `classification_feedback` insert error unchecked. | Regenerate WO on category change; check insert result. | M | M | BE#9 |
| 1.8 | **`text-faint` token fails WCAG AA in both themes** (~3.4:1 / ~4.1:1) yet used for 11–13px functional copy app-wide. | Darken/lighten token to ≥4.5:1; audit the 11 usages. | H | S | UI#1, dev-audit a11y |
| 1.9 | **Shared ExpandModal (all chart expands) has no dialog semantics.** No `role=dialog`, `aria-modal`, focus trap, or focus restore — keyboard/SR focus stays behind overlay. | Add semantics + focus management at the primitive. | H | M | UI#2 |
| 1.10 | **Landing is keyboard-invisible.** One `focus-visible` rule in ~2400 lines of CSS; hero CTAs, nav, FAQ, footer show no focus on the conversion path. | Global `:focus-visible` ring on interactive elements. | H | S | UI#3 |
| 1.11 | **Core report form has unlabeled inputs.** Manual-GPS address + login inputs use placeholder as only label (WCAG A). | Add `aria-label`/`<label>`. | M | S | UI#10, dev-audit a11y P0 |
| 1.12 | **submitReport self-heal demotes staff.** Upsert forces `role='resident'` on conflict for a user row with null city_id → staff/admin lacking city silently demoted. | Don't overwrite role on conflict; only set on insert. | M | S | BE#11 |
| 1.13 | **Storage RLS missing path scoping.** Any authed user can upload to any city folder. | Apply migration 006 / server-side path validation. | M | S | dev-audit sec P1 |
| 1.14 | **Open redirect in auth callback.** `next.startsWith('/')` allows `//evil.com`. | Verify same-origin via `new URL(next, origin)`. | M | S | dev-audit sec |
| 1.15 | **Add CI test gate + RLS regression tests.** 102 vitest tests exist, nothing runs on push; `tests/rls/` missing (violates own hard rule #3); live-DB drift already bit once (manual migration 021). | `.github/workflows/test.yml` (test+build+typecheck on PR); author `tests/rls/`. | H | M | STATE, MKT, graph |

## TIER 2 — Medium (dead code, dedup, perf, consistency)

| # | Item | Fix | Impact | Effort | Src |
|---|------|-----|--------|--------|-----|
| 2.1 | **~4.2k lines dead landing code + removable deps.** All of `components/landing/` except the riven subset; `index.tsx` admits "NO LONGER RENDERED" + `void WaitlistHero` lint-dodge. Drops `cobe` + `@radix-ui/react-accordion` deps. | Delete dead tree + voids; verify `tsc`+build. | H | S | FE#1/#11, PERF |
| 2.2 | **Design system exists in comments, not code.** 208 hardcoded `#0a84ff` across 56 files (token `--color-primary` exists); status colors in 3 forms (RGB/hex/CTA); radius scale wobbles (8/10/14/18/xl/2xl). Rebrand/theming impossible. | Consolidate to CSS tokens + a `STATUS_COLORS`/radius scale; codemod the hexes. | M | M | UI#9/#14, FE#2, dev-audit magic-values |
| 2.3 | **STATUS_LABEL/STATUS_TONE duplicated in 9 files** (canonical `lib/status.ts` exists, ignored; 3 copies already drifted). | Import canonical; extend it with the `PublicStatus` variant for `r/[token]`. | M | S | FE#2/#15 |
| 2.4 | **8 twin localStorage stores** re-implement `emit/hydrateOnce/listeners/readStorage` (~1.5k lines; `task-completion.ts` says "Mirrors teams-overrides.ts exactly"). | `createLocalStore<T>(key, validator)` factory (~60% cut). | M | M | FE#3, dev-audit |
| 2.5 | **Whole site is `force-dynamic`** (per-request CSP nonce) — landing + every route SSR'd per request, zero CDN cache. | Rethink nonce strategy so landing/static routes can be cached. | H | L | PERF |
| 2.6 | **AssistantWidget statically imported in root layout** → `ai`+`@ai-sdk/react`+`react-markdown` in first-load JS of every route even when closed/flag-off. | `next/dynamic` on first open. | H | S | PERF |
| 2.7 | **fullscreen-map statically imports ReportMap** (deck.gl+maplibre ~1.85MB) into `/map` route chunk though `ReportMapLazy` exists; deck.gl/maplibre boot ~400ms every map nav. | Use the lazy variant; defer map init until visible. | M | S | PERF, dev-audit perf P1 |
| 2.8 | **Dead staff modules.** `components/staff/work-order-grid.tsx` (383 ln, 0 importers) + `lib/staff/grid-data.ts`; live grid uses `components/city/work-order-grid`. Keep `staff/actions.ts` (imported by map) — relocate out of dead dir. | Delete dead pair; move the shared action. | M | S | FE#4, graph |
| 2.9 | **gsap AND framer-motion both shipped.** framer confined to landing/riven (2 real uses); 2 of its 5 importers are dead (2.1). | Delete dead → framer shrinks to 3 files; port to gsap → drop dep. | M | M | FE#5, PERF |
| 2.10 | **Hero LCP = 348KB plain jpg**, eager `fetchPriority=high`, no webp/srcset. | Re-encode webp (~120KB) + srcset. | M | S | PERF |
| 2.11 | **Service worker never registered** (0 `navigator.serviceWorker` refs) → caching strategy inert; precaches non-existent `/offline`. | Register it or delete `sw.js`. | M | S | PERF |
| 2.12 | **Sentry client likely dead** (no `instrumentation-client.ts` for Next 16; replay set without `replayIntegration()`) + `SENTRY_DSN` unset. | Wire instrumentation-client; set DSN; drop unused replay config. | M | S | PERF, dev-audit |
| 2.13 | **In-memory limiter Map never pruned** (slow leak on long-lived standalone). | Prune expired windows (folds into 0.3 durable store). | M | S | BE#12 |
| 2.14 | **Rules engine dead inputs.** Pipeline hardcodes `isSchoolZone:false/footTraffic:1/recurrence:0` → priority always `sev*2+1.5`; documented factors never fire. Retry predicate `msg.includes("rate")` over-matches ("generated"). | Feed real inputs or delete the params; tighten retry predicate. | L | M | BE#15 |
| 2.15 | **Duplicate util functions.** `timeAgo` ×3, `formatHours` ×2 (canonical exists). `DAY_MS`/`HOUR_MS` duplicated across 8 files. | Import canonical; single `time-constants.ts`. | L | S | FE#8, dev-audit magic-values |
| 2.16 | **PII (email) logged in plaintext** in notify delivery when disabled/key-missing. | Remove email from log message. | M | S | dev-audit debug-cruft P0 |
| 2.17 | **Report photos `alt=""`** though content-bearing → SR staff can't triage. | Contextual alt from category+address. | M | S | dev-audit a11y P0 |
| 2.18 | **Resident nav coherence frays.** Desktop omits Map (`/user/map` mobile-only); Grid tab dead-ends non-staff to `/login`; `/user/updates` hardcodes "Cumming"; ViewSwitch lands different screens by entry point. | Reconcile nav; resolve city name; unify entry target. | M | M | UI#4/#6/#8/#13 |

## TIER 3 — Product / Market (strategic, do in parallel with eng)

| # | Item | Note | Impact | Effort | Src |
|---|------|------|--------|--------|-----|
| 3.1 | **Three-way strategic fork, no ADR.** Docs/landing/leadgen = US Open311 cities; outreach CSV top leads = HOAs/campuses; active branch seeds Ahilyanagar India (INR, ₹83 hardcoded FX). These need *different products*. | Pick ONE segment, write the ADR. Evidence: HOA/campus = speed-to-revenue; cities = venture story. | H | S (decision) | MKT#1/#3 |
| 3.2 | **Lead with the surviving moat.** Research killed "only AI player" (SeeClickFix/CivicPlus shipped AI photo classify Jan 2026). Real edge = photo→costed-work-order automation; landing still leads with classification. | Reposition landing + outreach around auto work-order gen. | H | S | MKT#2 |
| 3.3 | **Demo-to-prod gap is a diligence landmine.** Upvotes/CSAT/overrides/categories/completion all localStorage; reasoning runs on ~1100-row synthetic corpus. A buyer's technical diligence fails this today. | Convert one narrow flow to a real production loop for the chosen segment (couples with 0.5). | H | L | MKT#4 |
| 3.4 | **India-readiness ~zero if pivot is real.** English-only, no WhatsApp intake (dominant Indian civic channel), onboard normalizes US state abbrevs, Open311 irrelevant there. | If India: i18n (Hindi/Marathi) + WhatsApp; else drop the branch. | H | L | MKT#5 |
| 3.5 | **Monetization machinery absent.** $0.50–2/capita → Cumming ACV ~$4–16k; no billing/contract/SLA-commitment code. | Add billing + SLA once segment chosen. | M | M | MKT#6 |
| 3.6 | **Cross-jurisdiction routing unsolved** (county road inside city limits can't route). | Parent-city model or Open311 escalation. | M | M | dev-audit todo |
| 3.7 | **Single shared Open311 API key / system user** — no per-partner scope/audit/rotation. | `api_keys → user_id` table. | M | M | SEC#7, dev-audit todo |
| 3.8 | **The close-the-loop bet is severed — highest-value product move, and it's evidence-backed.** Boston 311 field experiment (Buell/Porter/Norton, M&SOM 2020): residents shown a photo of completed work filed ~60% more reports across ~38% more categories. Civic's notification substrate (table/RLS/trigger) exists but has NO out-of-band delivery, and there's no resolution-photo step. The loop is broken at every stage. | Phase 1 of `docs/loop-closure-plan.md`: resolution-photo capture at closeWorkOrder + email-first notification delivery (Resend/SES). | H | L | graph (loop-closure-plan), MKT |
| 3.9 | **Routing/teams are in-memory + localStorage, not DB — multi-tenant blocker.** `teams.ts` = 12 compile-time presets; category→team lives in localStorage; `work-order-rules.ts` hardcodes routing. Migration 019 (`city_teams`) exists as the answer but DB-backed routing is still unwired. No second city can have different teams/routing until this lands. | Persist category→team per city (migration 019); keep RULES as cost estimation only; derive team ownership at the staff-inbox read boundary. | H | M | graph (city-onboarding spec, loop-closure-plan) |
| 3.10 | **AI cost estimates are fabricated.** Static rules table emits confident $ with zero empirical backing (a pilot buyer will not trust it). Cold-start spec exists: show "Unknown — not enough data" until ≥5 accepted actuals, then compute live per city/category with a reliability tier + outlier rejection. | Implement `docs/superpowers/specs/…cost-prediction-cold-start`: capture `actual_cost` at closeWorkOrder as the training signal. | M | M | graph (cost-prediction spec), BE#15 |
| 3.11 | **Duplicate route trees fragment the app.** Both `/city/[slug]` and `/[team]/[city]` exist; city-switch orphans team context. Loop plan already decided `/city/[slug]` canonical. | Delete `/[team]/[city]`; express team as segment/query. Complements the resident-nav coherence fixes (2.18). | M | M | graph (loop-closure-plan D1), UI |
| 3.12 | **Ship the classification-accuracy proof.** `verify-classify.mjs` proves the pipeline runs but measures zero accuracy; the golden-set harness (`tests/golden/`) measures the production prompt on labeled photos with buyer-quotable gates (category ≥85%, severity ±1 ≥90%, emergency FNR ≤5%). A missed `is_emergency` auto-dispatches — real liability. | Populate the golden set + run `pnpm eval`; publish the numbers as a sales asset. | M | M | graph (golden eval, research findings) |

---

## Cross-cutting themes (the graph's view)

1. **The demo/prod boundary is the existential defect.** It shows up as a security hole (0.1), an authz gap (0.2), fake analytics (0.5), and a sales risk (3.3). One disciplined `DEMO_MODE` seam fixes all four.
2. **The design system is documented but not enforced** — hardcoded hexes, duplicated status maps, wobbling radii. Consolidating tokens unblocks theming *and* the AA-contrast fix.
3. **Duplication is the dominant code smell** — 8 twin stores, 9 status-label copies, ×3 timeAgo, dual animation libs, twin rate limiters. All factory/canonical-import work, low risk.
4. **Perf regressions are mostly eager-import + force-dynamic**, not algorithmic — cheap wins (dynamic imports, lazy map, webp hero) before the structural nonce rethink.
5. **Governance is ahead of execution** — the loop/verifier/budget harness and the dev-audit corpus are excellent, but CI + RLS tests (the gates that catch drift) don't exist yet.
6. **The product's own strongest bet is unbuilt.** The graph shows a well-reasoned, peer-reviewed-evidence-backed close-the-loop plan (resolution photo + notifications → ~60% more reporting) and a DB-routing/onboarding design — but they sit in `docs/`, not in `src/`. The single highest-leverage *product* work (3.8) and the single hardest *multi-tenant* blocker (3.9) are both already specced; they need implementation, not more design.

## Suggested sequence
1. **Sprint A (safety):** 0.1–0.5, 1.4, 1.12, 1.15 — close the demo/prod hole, stop fake analytics, add CI. Nothing ships to a pilot until these land.
2. **Sprint B (cleanup):** 2.1, 2.3, 2.4, 2.6, 2.7, 2.8 — delete dead code, dedup stores/status, cut bundle. High ratio, low risk, makes everything after easier.
3. **Sprint C (correctness+UX):** 1.1–1.3, 1.5–1.11, 2.2, 2.18 — pipeline idempotency, Open311, a11y, design tokens.
4. **Parallel (product):** 3.1 → 3.2 → 3.3 — decision first, then reposition, then one real production loop.
