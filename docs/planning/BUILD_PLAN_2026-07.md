# Build Plan: 2026-07 (feat/sidebar-shell)

> **STATUS 2026-07-07, WS0, WS6 EXECUTED** (PR #9). Follow-ups also landed:
> emergency-dedup safety fix, RLS tests for the 025-028 tables, api-key mint
> script, ADR 0002 draft (Proposed), CI lint gate, live upvote counts.
> Blocked on the owner: apply migrations 024-028
> (`DATABASE_URL='postgresql://…' node scripts/run-migrations.mjs`, the DB
> password is not in the repo), set `RESEND_API_KEY`/`NOTIFY_FROM_EMAIL`/
> `NEXT_PUBLIC_SITE_URL`, decide ADR 0002, supply golden-set photos, merge
> PR #9. WS7 content work + deferred L items remain.

Synthesized 2026-07-07 from four parallel deep-dives: (1) gap inventory across every plan/spec doc vs actual src, (2) routing/demo-state/route-tree current-state map, (3) onboarding-branch merge analysis, (4) Next.js 16 CSP/PPR research. Supersedes nothing, REVAMP_PLAN.md remains the audit record; this is the execution plan for what's left.

**State going in:** REVAMP Tier 0 complete, Tier 1 complete, Tier 2 complete except 2.5 (deferred). Issue-8 cost cold-start merged. Resend email leg + `resolution_photo` plumbing exist but are not reachable from any UI. 29 planned-but-unbuilt items inventoried below, grouped into 8 workstreams.

Legend: effort S (<½ day) / M (½, 2 days) / L (>2 days). IDs reference the inventory (LCP = loop-closure-plan, HAW = help-assistant widget, CPC = cost-prediction spec, COF = city-onboarding spec, DA = dev-audit harvest, or REVAMP item numbers).

---

## WS0: Merge `docs/city-onboarding-plan` into this branch  DO FIRST

**Why first:** `feat/sidebar-shell`'s `city/[slug]/page.tsx` and layout already import `PREVIEW_SOURCES` and call the `_sources`-parameterized `city_stats` / `city_category_breakdown` RPC overloads, which are defined **only** in the onboarding branch's migration. The live-DB path on this branch is broken until the merge lands. Everything downstream (WS1, WS2) touches the same files.

**Facts (from merge-tree dry run):**
- Fork point: `260cce9` (both branches forked from the same main commit; no shared feature history).
- Onboarding branch adds ~49 pure-new files (TIGER engine, ingest adapters, admin shell, UI primitives `field/modal/select/stepper/switch/toast`, config-template, provision-city, all with tests). Zero collision.
- Only 4 real conflicts: `[team]/[city]/layout.tsx`, `[team]/[city]/page.tsx`, `city/[slug]/layout.tsx`, `dashboard-queries.ts` (5th file auto-resolves).
- Migration collision: onboarding's `20260614_015_city_config.sql` collides with sidebar-shell's `015_under_fix_estimates.sql` by number, and overlaps 019 semantically (`cities.center`, `users.team_key`, `city_teams`).

**Steps:**
1. Pre-merge: copy onboarding's `015_city_config.sql` content into a new `20260707_024_city_config.sql` on this branch, **stripped** of the sections 019 already applied (`cities.center`, `users.team_key`/`is_shared`, `city_teams` table). Keep: `reports.source`, `city_departments`, `category_routing`, `sla_targets`, `cost_rules`, `provision_jobs`, `provision_city()` RPC, `city_for_point()` RPC, `_sources` overloads of `city_stats`/`city_category_breakdown`. Make every statement idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).
2. `git merge docs/city-onboarding-plan` (NOT rebase, 16 interdependent commits would replay conflicts repeatedly; NOT cherry-pick, the commits are a dependency chain).
3. Resolve the 4 conflicts with one consistent rule: **keep sidebar-shell's UI chrome, take onboarding's DB-first data path.**
   - `[team]/[city]/layout.tsx`: keep `TeamSidebar` mount; add `dynamicParams = true`, `fetchCorpus`, `PREVIEW_SOURCES`, `DEMO_MODE` gate; replace `KNOWN_CITIES` notFound guard with DB-first `fetchCity` + fallback.
   - `[team]/[city]/page.tsx`: keep `TeamDashboardInteractive` (sidebar-shell's richer component); add onboarding's `resolveCity()` DB resolution.
   - `city/[slug]/layout.tsx`: keep `CitySidebar` + `isStaffForCity`; take onboarding's corpus block.
   - `dashboard-queries.ts`: union of both sides' exports (no name overlap).
4. Delete/park the merge's second migration file (the original 015) so only `024` ships.
5. Decide the wizard question explicitly: two wizards now exist, `/onboard` (sidebar-shell, Nominatim, 5-step, any signed-in user, active=true immediately) and `/admin/onboard` (onboarding branch, TIGER boundary + cold-start + preview + explicit go-live, admin-gated). **Recommendation: `/admin/onboard` becomes the real provisioning path** (it has the boundary engine, seeding, admin gate, go-live review); keep `/onboard` as the public marketing-funnel entry that collects the request and hands off, or redirect it. Do not leave both writing cities with different semantics.

**Verify:** `pnpm tsc --noEmit` clean; `pnpm vitest run` (onboarding brings ~14 test files, all new); `pnpm build`; apply 024 to a shadow DB and smoke `/city/{slug}` + `/admin/onboard`.

**Effort:** M (single session; ~4 files × 10-30 lines of conflict work + migration surgery).

---

## WS1: Close the loop end-to-end (REVAMP 3.8 + LCP-03/04/05/06/07/08 + CPC-04)

The single highest-value product work (Boston 311 evidence: resolution photo → ~60% more reports). Everything below exists as disconnected halves: `closeWorkOrder` server action exists but **no UI calls it**; `deliverEmail` exists but **nothing drains to it**; CSAT exists but only in localStorage.

Order within the workstream:

1. **LCP-07/08 + CPC-04. Close-work-order dialog (M).** Build the close dialog (required "Actual cost spent" input + resolution-photo upload) and wire `team-task-detail.tsx` / grid row actions to the `closeWorkOrder` server action (`src/app/staff/actions.ts:196`) instead of `useTaskCompletion` localStorage. This one change simultaneously: makes task completion real (3.3), starts the actual-cost training signal (cost cold-start needs ≥5 actuals), and captures the resolution photo (the loop-closure bet). After-photos go to Supabase Storage, not data-URLs. Keep `useTaskCompletion` only as demo-mode branch (`DEMO_MODE` gate).
2. **LCP-04, `report_updates` + `report_media` migration (M).** New migration `025`: append-only `report_updates` (report_id, status, note, photo_url, actor, created_at) + `report_media`. `closeWorkOrder` writes an updates row in the same transaction. Feeds both the resident timeline and the Open311 service-request-updates feed.
3. **LCP-05 (Notification delivery (M, descoped from L).** Don't build a worker/queue first. Send inline at notification-write time: `status-notify.ts` already builds the message; call `deliverEmail()` there with a `delivered_at`/`delivery_error` column on `notifications` (add to migration 025). A drain endpoint (`/api/admin/notify-drain`, admin-gated, re-sends failed rows) is the retry story) a systemd timer / external cron can hit it on the self-hosted box. Queue infrastructure only if volume ever demands it.
4. **LCP-06, CSAT in the resolution email (M).** Tokenized one-tap 👍/👎 links in the resolution email hitting `/r/[token]` (public status page already exists); persist to a `report_csat` table (also migration 025); keep localStorage as optimistic cache.
5. **LCP-03, Anon `public.users` row at sign-in (S).** Create the row at `signInAnonymously` so the status-change trigger doesn't no-op on first-time reporters.

**Verify:** vitest for close-action + notify paths; manual thread: submit → dispatch → close w/ cost+photo → email arrives (Resend test key) → CSAT tap recorded → timeline shows updates row. This is also the demo script's money shot.

**Effort:** ~4-6 days total. Blocks on WS0 (migration numbering, same staff surfaces).

---

## WS2: DB-backed per-city team routing (REVAMP 3.9 + COF-01, multi-tenant blocker)

**Current state (mapped):** `categoryToTeam()` at `src/lib/teams.ts:178` = localStorage override snapshot → static compile-time map. `city_teams` table exists (migration 019), onboarding writes it, and `fetchCityTeams`/`resolveCategoryTeam` in `src/lib/onboarding/city-teams.ts` are **dead exports. Zero callers**. Work orders store `department`, never a `team_key`.

**Design decision: resolve-at-write + denormalize.** Write `team_key` onto the work order at creation time (pipeline) and on category override (staff action), resolved from `city_teams` with static-map fallback. Read surfaces prefer the stored `team_key` and fall back to `categoryToTeam()` for legacy rows. This avoids threading async city-context into ~10 client components that currently call `categoryToTeam()` synchronously (grid cells, map pins, team dashboards).

**Steps:**
1. Migration `026`: `work_orders.team_key text` (nullable; backfill from category via static map).
2. `classify-pipeline.ts:357` + `staff/actions.ts:418` (override path): resolve via `resolveCategoryTeam(cityId, category)` (finally calling the dead export), write `team_key`.
3. Read boundary: `getReportTeam()` in `teams-overrides.ts:154` already has the hook (`overrides[id] ?? report.assigned_team ?? categoryToTeam()`), populate `assigned_team` from the DB row in the corpus/query mappers (`dashboard-queries.ts`, grid data). Grid TeamCell (`work-order-grid.tsx:462,820`), map pins (`fullscreen-map.tsx:220,541`), and team dashboards then work unchanged.
4. Routing-matrix UI (`routing-matrix.tsx`): swap `category-overrides.ts` localStorage writes for a server action updating `city_teams.categories[]` (staff-gated; RLS currently service-role-write only, keep it that way, go through the action). History/audit moves to a `city_teams_history` row or reuse `report_updates` pattern. Kills localStorage keys `civic.routing_overrides.v1` + history (part of 3.3).
5. Per-report delegation (`teams-overrides.ts`, key `civic.team_overrides.v1`): same pattern. Server action writes `work_orders.team_key` directly + audit row. Kills the second must-move localStorage store.

**Verify:** vitest unit on resolver fallback chain; RLS test that anon can't write `city_teams`; manual: onboard city with custom routing → submit report in that category → work order lands on the custom team in inbox/grid/map.

**Effort:** M, L (~2-3 days). Blocks on WS0 (city_teams writers merge). WS1 and WS2 touch different write paths and can run in parallel after WS0.

---

## WS3: Route-tree unification (REVAMP 3.11 / LCP-12 D1)

**Do NOT plain-delete `/[team]/[city]/*`**: five link generators break (`city-sidebar.tsx:54`, `teams/page.tsx:71`, `team-roster.tsx:235`, `team-nav.tsx:21`, `team-sidebar.tsx:34,67`) and the `lockedTeam` FilterProvider + `TeamDashboardInteractive` are real capabilities the canonical tree lacks.

**Plan:** move, don't remove.
1. Create `/city/[slug]/team/[teamId]/{page,analytics,map}` reusing the exact components; layout sets `lockedTeam` inside the city layout (inherits DB-first city resolution + `CitySidebar` for free, also fixes the `KNOWN_CITIES`-only limitation where onboarded cities have no team views).
2. Update the 5 link generators to the new pattern.
3. Delete `src/app/[team]/[city]/` + `TeamHeader`/`TeamSidebar` chrome (the city sidebar with team sub-items replaces cross-team nav).
4. Sweep for stragglers: grep `\$\{.*teamId?.*\}/\$\{.*(city|slug)` and hardcoded `/streets_roads/` style paths in tests/docs.

**Verify:** `pnpm build` (no orphan imports); click-through every sidebar/team link; 301s optional (internal app, no SEO stake).

**Effort:** M (~1 day). Best done AFTER WS0 (the conflicted layouts are exactly these files, don't merge into a tree you're about to move) and ideally after WS2 (team pages read `team_key`).

---

## WS4: CSP / static caching (REVAMP 2.5). Research resolved, plan is concrete

**Research verdict (Next 16.2.6, self-hosted standalone):** PPR is now `cacheComponents: true` (top-level flag, `experimental.ppr` is gone) and works self-hosted, but **nonce-based CSP is documented-incompatible with it** (official CSP docs + issue #89754). The correct fix is **hash-based CSP** for the two constant inline scripts, dropping the per-request nonce entirely:

1. Compute SHA-256 of `THEME_INIT`, `SW_SCRIPT` (prod), `SW_CLEANUP` (dev). Add a prebuild script that computes hashes from the source constants so hash-drift is impossible.
2. `src/proxy.ts` `buildCsp()`: replace `'nonce-${nonce}'` with the hashes; keep `'strict-dynamic'` (hash-allowed inline scripts propagate trust to Next's chunk loader; IE-fallback path also fine; `unsafe-hashes` NOT needed, that's only for event-handler attributes). Remove `x-nonce` header injection.
3. `src/app/layout.tsx`: remove `headers()` call, `nonce` props, and `export const dynamic = "force-dynamic"`. Layout becomes sync; routes with no dynamic data (landing, `/offline`, terms/privacy) become static automatically; auth/data routes stay dynamic naturally via `cookies()`/Supabase.
4. Sentry: its scripts load via Next's bootstrap → covered by `strict-dynamic` propagation; verify anyway.

**Verification checklist (needs live browser, do NOT batch blindly):** build output shows `●` static for landing/offline; response CSP has `sha256-…` no `nonce-`; zero console CSP violations; theme applies pre-paint on hard refresh; SW registers in prod build; auth-gated routes still redirect. `next build && node .next/standalone/server.js` + browser pass per the checklist. Playwright MCP available in this environment for the browser pass.

**Effort:** M (was L when the path was unknown; research killed the unknowns). Independent. Can run anytime, but pairs well with a Playwright verification session.

---

## WS5: Demo-to-prod state (REVAMP 3.3), remainder

Store triage (full map in the routing deep-dive):

| Store | Verdict | Where handled |
|---|---|---|
| `civic.task_completion.v1` | must move | WS1 step 1 |
| `civic.routing_overrides.v1` (+history) | must move | WS2 step 4 |
| `civic.team_overrides.v1` (+history) | must move | WS2 step 5 |
| `civic.resident_csat.v1` | move | WS1 step 4 |
| `civic.upvotes.v1` | move for GA | **this WS**: `report_upvotes` table (report_id, user_id unique) + count on browse; localStorage stays as optimistic layer |
| `civic.custom_categories.v1` | move for GA | **this WS**: `issue_types` table per city; wizard + routing matrix read it |
| `civic.demo_reports.v1` | keep local | intentional demo theater |
| `civic.theme` | keep local | UI preference |

**Effort:** M for the two remaining tables. After WS1+WS2, "demo-to-prod gap" is closed for a pilot's diligence pass: every operational write (completion, cost, routing, delegation, CSAT) hits Postgres.

---

## WS6: Small-item batch (each S, bundle into 1-2 PRs)

| ID | Item | File |
|---|---|---|
| CPC-03 | Clamp AI `est_cost` ceiling | `work-order-ai.ts:123`, `work-order-schema.ts:40,79` |
| LCP-09 | `pctChange` 0→N returns `null` ("new"), not 100 | `resident-data.ts:494` |
| LCP-01 | Drop module-global `_demoReporterId` cache | `resident-data.ts:103` |
| LCP-13 | `lockedTeam` filter shows disabled badge | FilterBar |
| LCP-14 | Open311 `status_notes` for merged/rejected | `open311/transform.ts:92` |
| COF-02 | Set `app_metadata.role` at provisioning | `onboard/actions.ts` |
| COF-03 | Per-account city cap on self-serve onboarding | `onboard/actions.ts` |
| HAW-02 | Demo-persona branch in `resolveChatContext` | `ai/chat/context.ts` |
| HAW-01 | `e2e/assistant.spec.ts` smoke test | new |
| CPC-01 | Decide: emergency reports get work orders (recommended, they're the most expensive events, cost model needs them) or delete dead `+50` term | `classify-pipeline.ts:246` |

**Effort:** ~1-2 days total.

---

## WS7: Proof + strategy (parallel track, non-code or decision-shaped)

1. **3.12 golden-set eval (M):** populate `tests/golden/images/` with labeled photos (manifest schema exists), run `pnpm eval`, gate: category ≥85%, severity ±1 ≥90%, emergency FNR ≤5%. Publish numbers as sales asset. Emergency FNR matters doubly if CPC-01 auto-dispatches.
2. **3.1 ADR. Pick the segment (S, decision):** US Open311 cities vs HOA/campus vs Ahilyanagar/India. Everything in Tier 3 (billing 3.5, India 3.4, landing copy 3.2) hangs on this. The repo currently pays a three-way tax. Write `docs/decisions/0002-target-segment.md`.
3. **3.2 landing reposition (S, after ADR):** lead with photo→costed-work-order automation (the surviving moat), not classification.
4. **DA-01 Open311 `api_keys` table (M):** `api_keys(key_hash, user_id, city_id, scopes, revoked_at)`; per-partner attribution + rotation. Needed before any real Open311 partner.

---

## Deferred (L-effort, sequence after the above)

- **LCP-15** routing_rules zone-polygon GIS routing (PostGIS `ST_Contains`), after WS2 proves DB routing.
- **LCP-16** SLA `due_at` + overdue escalation job. Note: onboarding merge (WS0) brings `sla_targets` table, so the schema half arrives free.
- **LCP-17** supercluster + viewport bbox re-query on map.
- **LCP-19** pre-submit duplicate deflection ("Add your voice" CTA).
- **LCP-20** server-side EXIF strip.
- **LCP-21** remaining a11y sweep (modal traps, color-only dots, 44px targets).
- **HAW-03** assistant Phase 2 (staff tools, pgvector, persistence).
- **DA-02** cross-jurisdiction routing (REVAMP 3.6). Needs LCP-15's zone machinery; design first.
- **3.4 / 3.5** India-readiness / billing, blocked on the 3.1 ADR.

---

## Sequence summary

```
WS0 merge (M) ──┬── WS1 close-the-loop (4-6d) ──┐
                └── WS2 DB routing (2-3d) ──────┼── WS3 route unification (1d)
WS4 CSP/static (M, independent, browser session)│
WS6 small batch (1-2d, anytime)                 └── WS5 remainder (M)
WS7 strategy/eval (parallel, mostly non-code)
Deferred L items follow
```

Roughly 2-3 weeks of focused work to clear WS0, WS6; WS0 is the only hard gate.

## Verification gates (every workstream)

- `pnpm tsc --noEmit` + `pnpm vitest run` + `pnpm build` green before any merge (CI gate from T1.15 enforces on PR).
- New tables → RLS regression test in `tests/rls/`.
- WS1/WS2 get a manual end-to-end thread against a shadow Supabase before touching live (live-DB drift has bitten before, migration 021).
- WS4 additionally needs the live-browser CSP checklist (static HTML + hash CSP is prod-only breakage, invisible to tsc/vitest).
