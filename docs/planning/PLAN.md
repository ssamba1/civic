# CIVIC — Master Plan (Final, v3 · "boil the ocean")

> The definitive build plan for Civic. Pairs with `context.md` (why), `design.md` (how), `agents.md` (rules). Where this conflicts with older docs, the **product owner's two-sided vision wins** (§4). Every recommendation is research-backed — sources in §40. Last updated 2026-05-27.

---

## TABLE OF CONTENTS
0. TL;DR · 1. One-liner · 2. Why it wins (rubric) · 3. Personas · 4. Principles · 5. Ground truth · 6. Routes · 7. Roles/auth · 8. IA/nav · 9. Screens · 10. Data model · 11. Feature catalog (MoSCoW) · 12. AI strategy · 13. Competitive teardown · 14. Geolocation strategy · 15. Image pipeline · 16. Offline-first · 17. Notifications & email · 18. i18n & equity · 19. Trust & safety · 20. Dedup & embeddings · 21. Realtime · 22. Design system · 23. Accessibility & law · 24. Performance & Next 16 caching · 25. Security & privacy · 26. Open311 conformance · 27. Data flows · 28. Components · 29. Build phases · 30. Bug register · 31. Demo script · 32. Seed data · 33. Testing · 34. KPIs · 35. ADRs · 36. Deps/SDK · 37. Risks · 38. Roadmap · 39. Open decisions · 40. Sources

---

## 0. TL;DR for a new contributor

Civic = **2-tap photo → AI-classified, costed, routed city work order → public accountability scoreboard**, Open311-compatible, offline-capable, bilingual. Two sides: residents (report + browse + upvote + track) and government staff (dispatch inbox + map + analytics + contacts). Stack: Next.js 16 RSC + Supabase (Postgres/PostGIS/Auth/Storage/Realtime/pgvector/pg_cron) + Gemini 2.5 Flash + Leaflet/OSM + Resend. **The scaffold looks complete but the resident submit path is architecturally broken, the public dashboard is 100% mock, and there's no login UI.** Phase 0 fixes those; Phases A–E build the vision. Read §5 (ground truth), §30 (bugs), §29 (phases), §11 (features) first.

---

## §S — DEMO SPINE (AUTHORITATIVE for this hackathon)

> **This section overrides the phase plan (§29) for hackathon scope.** Context: ~1–3 days, team of 2–4, Supabase + Gemini keys exist. Everything below §S in this doc is **reference/roadmap** — build the spine first; pull from the rest only if ahead.

### Verification status of the audit (checked against current code 2026-05-28)
- **CONFIRMED:** C1 (submit pipeline crashes — server action calls browser-only blur + browser client), M5 (staff/page.tsx redirects every staff user — `role !== "staff"` where no `"staff"` role exists; inbox unreachable), H4 (service-role insert bypasses RLS), H5 (storage INSERT policy unscoped by path), H6 (classify reads blurred image), M2 (no model_version/raw_response).
- **CORRECTED:** L6 is FALSE (no stale `middleware.ts`). H3 (Open311 lat/long=0,0) is *serialization-dependent* — verify with one `curl` once backend is live, don't assume. New **L7**: `/api/auth/logout` referenced by staff layout but missing.
- **Verify-before-trust list:** H3 (curl Open311), H8 (confirm PostgREST embedded-filter behavior), H7 (does fire-and-forget classify actually run on Vercel).

### The spine (only these ship for the demo)
The winning demo is one unbroken thread: **submit (on real backend) → AI classify → costed work order in staff inbox → dispatch → live on public map + scoreboard.** Plus resident browse + upvote. Nothing else is required to win.

```
MUST (demo thread — if any breaks, demo breaks)
  S1 infra: real .env.local, run migrations, seed Cumming           [Track Data]
  S2 fix submit: client compress+blur+upload, server insert+classify [Track Resident] (C1,H4,H9,L4)
  S3 classify from photos-raw + persist model_version               [Track AI] (H6,M2)
  S4 Gemini structured output (responseSchema)                      [Track AI] (M9 optional)
  S5 /login + anonymous bootstrap + /api/auth/logout                [Track Resident] (H1,L7)
  S6 fix staff/page role check (3 roles + city) + proxy target      [Track AI] (M5,L2,M4)
  S7 wire dashboard + browse to real data (view + GeoJSON RPC)      [Track Data] (H2,H3)
  S8 migration 005 (tags, upvotes+trigger) + upvote button + browse [Track Resident] (B1-B4)
  S9 cost compute + SLA + show in staff detail/inbox                [Track AI] (C2,C3)
  S10 scoreboard w/ by-neighborhood equity                          [Track Wow] (D1)
  S11 realtime pin drop on browse/map                               [Track Wow]
  S12 seed demo data (closed w/ before/after, open>30d, upvotes)    [Track Data]

ONE showstopper (pick exactly one; don't do both under time pressure)
  • Offline submit (IndexedDB outbox + Background Sync + retry)   OR
  • Web push close-the-loop (iOS 16.4 install + VAPID)

EXPLICITLY CUT to roadmap (do NOT build for demo)
  i18n/Spanish · kiosk · low-bandwidth · pgvector dedup · shadow ingest ·
  gamification · video · right-to-be-forgotten · privacy crons (do minimal/manual) ·
  trust score · /staff/map · /staff/settings full CRUD (hardcode cost_rules in seed)
```

### Parallelization (team of 2–4)
- **Track Data/Infra:** S1, S7, S12, storage RLS scoping (migration 006).
- **Track Resident:** S2, S5, S8 (submit, login, tags/browse/upvote, my-reports if time).
- **Track AI/Admin:** S3, S4, S6, S9 (pipeline, structured output, staff fix, cost/SLA).
- **Track Wow/Polish:** S10, S11, the one showstopper, Lighthouse/axe pass, demo rehearsal.

### 2-day timeline
- **Day 1 AM:** S1 (infra) ‖ S2 (submit) ‖ S6 (staff fix). Goal: backend live, submit works end-to-end on real DB.
- **Day 1 PM:** S3+S4 (AI) ‖ S5 (login) ‖ S7 (real dashboard). Goal: full thread submit→classify→inbox visible.
- **Day 2 AM:** S8 (tags/browse/upvote) ‖ S9 (cost/SLA) ‖ S11 (realtime). Goal: resident + admin sides feature-complete for demo.
- **Day 2 PM:** S10 (scoreboard) + ONE showstopper + S12 (seed) + polish + **rehearse the 3-min demo twice**.

### Definition of "demo-ready"
Submit a real photo on a phone → it classifies → appears as a costed work order in `/staff` → dispatch with `d` → shows live on `/city/cumming/browse` map → reflected on `/city/cumming/scoreboard`. Upvote works. Runs on the deployed URL, not just localhost.

### First action (today)
1. Drop real keys into `.env.local`; `corepack pnpm db:migrate && corepack pnpm db:seed`.
2. `curl` the Open311 endpoint to settle H3 (is lat/long 0,0?).
3. Start S2 + S6 in parallel — they unblock the whole thread.

---

## 1. One-liner
**See a broken street. Snap it. Watch your city fix it — on a public scoreboard the city can't hide.**

---

## 2. Why this wins (mapped to real rubrics, §40)

Civic-tech hackathon rubrics weight ≈ **Relevance/Impact 25 · Technical 20 · Ethics 20 · Design 15 · Presentation 10**.

| Criterion | How Civic wins | Evidence |
|---|---|---|
| **Impact 25** | NYC: 42M 311 calls/yr, 3-day median; Winnipeg sidewalks **61.8 days vs 2-day target**; Memphis potholes 3–7 business days. Free for residents forever. Equity lens for underserved neighborhoods. | context.md; §40 |
| **Technical 20** | RSC + PostGIS + RLS + on-device privacy blur + Open311 XML/JSON + realtime + **offline background-sync** + pgvector dedup + PPR caching. | this doc |
| **Ethics 20** | Privacy-by-construction; **equity dashboard** (inequitable 311 → civil-rights scrutiny, §40); transparent AI confidence + override; no full anonymity to curb abuse; **ADA Title II / WCAG AA** (law for cities >50k as of 2026-04-24). | §19,23,25 |
| **Design 15** | 2-tap submit, keyboard staff inbox, live clustered map, WCAG 2.2 AA, dark mode, Lighthouse 90/95/95. | §22–24 |
| **Presentation 10** | Live phone demo: submit (even offline) → pin pops live → already a costed work order → scoreboard. | §31 |

**Wedge (context.md):** win residents → make performance legible → sell the integration. Incumbents are procurement-led and cannot run consumer-growth + public-pressure.

---

## 3. Personas
- **Maya, 34, resident** — 2-tap submit + proof it got fixed.
- **Mark, 51, foreman** — photo + precise location + materials + **cost** per order.
- **Theresa, 47, city manager** — real-time performance dashboard.
- **Andrew, reporter** — easy data → the article that drives the first city inbound.
- **Rosa, 68, Spanish-first, library computer** — needs bilingual UI + kiosk + low-bandwidth (digital-divide persona, §18).

---

## 4. Principles (owner-confirmed 2026-05-27)
1. Resident side brutally simple — photo (+video later) + description + a few tags; browse + **upvote**.
2. Admin side information-dense — overview, map, **cost, urgency, time-to-fix, who-to-contact**.
3. **Social features IN** (upvotes) — overrides old anti-goal.
4. **Filters/tags on submit IN** — overrides old no-picker rule.
5. Privacy non-negotiable — client-side blur; raw never public.
6. Open311 is table stakes.

---

## 5. Ground truth (status of scaffold)

**Stack:** Next.js 16.2.6 (App Router, RSC, Turbopack, standalone), TS strict, React 19, Tailwind v4, Supabase, **Leaflet+OSM/Carto/ArcGIS tiles** (free; `mapbox-gl` vestigial), Supercluster, **Gemini 2.5 Flash** via **deprecated** `@google/generative-ai@0.24.1` (migrate to `@google/genai`), Zod v4, Biome, Vitest, Sentry.

**Security baseline present:** CSP/HSTS(preload)/X-Frame DENY/nosniff/Referrer/Permissions headers; RLS default-deny; admin role from `app_metadata`; constant-time key compares.

- ✅ Schema (4 migrations), Open311 routes, classify pipeline, staff inbox (real data), capture UI, dashboard UI, PWA shell, privacy *libraries*, headers.
- 🔴 **Resident submit broken** — `report/actions.ts` (`"use server"`/Node) calls browser-only `blurFacesAndPlates()` + `createBrowserSupabase()` → `document is not defined`; blur never runs, submit fails.
- 🔴 **Dashboard 100% mock** — `dashboard-data.ts` stubs; `dashboard_reports_view` + 6 `metric_*` views unused.
- 🔴 **No `/login`** — submit + staff blocked; resident e2e unrunnable.
- 🟠 Open311 **lat/long always 0,0** (EWKB hex unparsed); `service_code` filter returns all rows; datetimes not ISO-8601; classify fetch fire-and-forget.
- 🟠 Storage RLS lets any user write any city path; classify runs on **blurred** image.
- 🟡 6 smaller bugs (role check, `/offline`, override enum, notes/photo persistence, redirect target, model_version). Full register §30.

---

## 6. Complete route map
Legend: ✅ built · ⚠️ partial/broken · ❌ new

```
PUBLIC (no auth) — locale-prefixed /[locale]/... once i18n lands
  /                                ✅ landing + city search
  /city/[slug]                     ⚠️ dashboard (MOCK)
  /city/[slug]/map                 ⚠️ fullscreen map (MOCK)
  /city/[slug]/browse              ❌ resident browse + upvote
  /city/[slug]/scoreboard          ❌ accountability scorecard (high-wow)
  /offline                         ❌ PWA fallback (referenced, missing)
  /kiosk/[slug]                    ❌ shared-device mode (digital divide)
  /api/health                      ✅
  /api/open311/v2/{services,requests,requests/[id]}  ✅ (bugs §26,30)

RESIDENT (auth; anonymous bootstrap)
  /login                           ❌ magic link + anon bootstrap
  /report                          🔴 capture UI; submit BROKEN
  /report/[id]                     ❌ shareable public status page
  /me/reports                      ❌ my reports + close-the-loop

ADMIN (staff_dispatcher | staff_supervisor | admin)
  /staff                           ⚠️ inbox (real data; role bug)
  /staff/work-order/[id]           ❌ deep-linkable detail
  /staff/map                       ❌ nav links; 404
  /staff/stats                     ❌ analytics (metric_* ready)
  /staff/settings                  ❌ contacts, cost rules, crews, SLA
  /admin/metrics · /admin/audit    ❌ admin-only

INTERNAL
  /api/ai/classify                 ✅ POST (session OR x-internal-key)
  /api/cron/*                      ❌ (or pg_cron) retention, audit, embeddings, weekly summary, SLA sweep
  /api/account                     ❌ DELETE — right-to-be-forgotten
  /api/push/subscribe              ❌ web push registration
  server actions                   submit 🔴 · dispatch/close/reject/override ✅ · upvote ❌ · contacts ❌ · notes ❌
```

---

## 7. Roles & auth matrix

| Capability | anon | resident | dispatcher | supervisor | admin |
|---|:--:|:--:|:--:|:--:|:--:|
| View dashboard/map/browse/scoreboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Open311 read | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit report | – | ✅ | ✅ | ✅ | ✅ |
| Upvote / track own / get notified | – | ✅ | ✅ | ✅ | ✅ |
| Inbox dispatch/close/reject/override | – | – | ✅ | ✅ | ✅ |
| Contacts / cost rules / crews / SLA | – | – | – | ✅ | ✅ |
| Metrics / audit log / forget-user | – | – | – | ⚠️ | ✅ |

**Auth (research §40 Supabase):** silent `signInAnonymously()` on first action keeps the 2-tap goal; `linkIdentity`/magic-link upgrades to cross-device. Staff/admin magic-link; admin role in `app_metadata` only. **Pick ONE role source** (`public.users.role` recommended) — today `proxy.ts` uses `app_metadata`, app uses the table → divergence bug (§30 M4).

---

## 8. IA / navigation
- **Public/resident shell** (`city/[slug]/layout` + `city-nav`): `Dashboard · Map · Browse · Scoreboard · [Report]` + language switcher + account chip.
- **Resident PWA** (`manifest` `start_url=/report`, Web Share Target → `/report`).
- **Staff shell** sidebar: `Inbox · Map · Stats · Settings · [profile/logout]`.

---

## 9. Screens (wireframes)

### Landing `/`
```
[nav: Civic   Dashboard  Report]   See it. Snap it. Your city fixes it.
[ search your city … ] → Cumming, GA   [Report an Issue][View Dashboard]
1 Photo · 2 AI classifies · 3 City fixes
```
### Resident report `/report` (full-bleed)
```
camera → preview(+description +TAGS❌) → submitting → done
   GPS: device → EXIF fallback → manual address
   PRIVACY: compress → blur (client) → upload before any network send
   OFFLINE: queue to IndexedDB outbox → Background Sync → toast "will send when online"
   is_emergency → Call 911 interstitial
```
### Browse `/city/[slug]/browse` ❌
```
[category▾][severity▾][status▾][sort: top|new|nearby ▾]
list(▲ upvote, photo, age, status) ⟷ live map(clustered, realtime pin drop)
```
### My reports `/me/reports` ❌
```
• Pothole·Main St  DISPATCHED ▲12 [photo]   • Graffiti·Oak CLOSED ✓ before|after
[🔔 notify me when fixed]
```
### Public dashboard `/city/[slug]` ⚠️ → wire real
```
[stats cards] → [map] → [category chart | recent reports]
```
### Scoreboard `/city/[slug]/scoreboard` ❌ (high-wow)
```
Median resolution 41h (target 72h)✅ · Open>30d: 6 · On-time 88%
By category & By NEIGHBORHOOD (equity) · vs neighbors (Open311 ingest)
AI weekly summary (Gemini → press-ready paragraph)
```
### Staff inbox `/staff` ⚠️ + detail
```
[status tabs][search]  cat│sev│addr│age│est│$COST❌│▲│SLA│📷
detail: raw photo(signed) · AI class(conf bar) · WO dept/crew/time/$cost/materials
        · CONTACTS❌ · notes⚠ · resolution📷⚠ · [Dispatch|Close|Reject|Override]
SLA badge: ⏳ due 6h / 🔴 overdue
```
### Staff map/stats/settings, login, offline, kiosk — §6.

---

## 10. Data model

**Current:** cities, users, reports, classifications, work_orders, assets, merges, verifications, audit_log. Views: dashboard_reports_view (PII-stripped), 6 metric_* views. Geo `geography(POINT,4326)` GiST.

### Migration `005` (⚠️ migrations spec-protected, agents.md #10 — needs approval)
```sql
ALTER TABLE reports ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE reports ADD COLUMN upvote_count int NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN neighborhood text;        -- equity reporting
ALTER TABLE reports ADD COLUMN embedding vector(768);    -- pgvector dedup
CREATE TABLE report_upvotes (
  report_id uuid REFERENCES reports(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id));
CREATE TABLE cost_rules (
  city_id uuid REFERENCES cities(id), category classification_category,
  labor_rate_cents_per_min int NOT NULL, base_materials_cents int NOT NULL DEFAULT 0,
  PRIMARY KEY (city_id, category));
ALTER TABLE work_orders ADD COLUMN est_cost_cents int;
ALTER TABLE work_orders ADD COLUMN sla_due_at timestamptz;
ALTER TABLE work_orders ADD COLUMN staff_notes text;
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), city_id uuid REFERENCES cities(id),
  department work_order_department NOT NULL, name text NOT NULL, phone text, email text, role text);
CREATE TABLE crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), city_id uuid REFERENCES cities(id),
  name text NOT NULL, department work_order_department, active boolean DEFAULT true);
CREATE TABLE push_subscriptions (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, endpoint text PRIMARY KEY,
  p256dh text, auth text, created_at timestamptz DEFAULT now());
ALTER TABLE users ADD COLUMN trust_score int NOT NULL DEFAULT 0;  -- abuse/reputation
-- triggers: upvote_count maintenance; sla_due_at = created_at + per-category target
-- RPC reports_geojson(_city) selecting ST_AsGeoJSON(location) — fixes Open311 0,0
CREATE EXTENSION IF NOT EXISTS vector;
```
### Migration `006` — storage RLS folder-scoping (fixes audit #5)
```sql
CREATE POLICY "public upload scoped to own city" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='photos-public' AND (storage.foldername(name))[1]=current_user_city_id()::text);
-- same for photos-raw
```
**RLS new tables:** report_upvotes (self insert/delete, city select); cost_rules/contacts/crews (staff read, supervisor/admin write); push_subscriptions (self); add tags+upvote_count to dashboard_reports_view.

---

## 11. Feature catalog (MoSCoW)

**MUST (demo-critical)**
- Fix submit pipeline (client compress→blur→upload; server insert+classify). [§15]
- `/login` + anonymous bootstrap. [§7]
- Wire dashboard to real data (view + GeoJSON RPC). [§5]
- Open311 conformance fixes (lat/long, !inner, ISO dates, awaited classify). [§26]
- Gemini structured output. [§12]
- Tags on submit; browse + upvote; my-reports/close-the-loop. [§9]
- Real cost + SLA in staff detail/inbox. [§10]
- Scoreboard with by-neighborhood equity. [§9]

**SHOULD**
- Offline background-sync outbox. [§16]
- EXIF GPS fallback + reverse geocode. [§14]
- Web push close-the-loop + Resend email. [§17]
- /staff/map + /staff/stats (metric_* + SLA + equity). 
- Contacts CRUD; notes persistence; resolution photo upload + AI score.
- pgvector dedup (log-only). [§20]
- Privacy crons wired (retention, audit). [§25]
- Trust/abuse controls. [§19]

**COULD**
- i18n Spanish (next-intl); kiosk mode; low-bandwidth mode. [§18]
- Open311 shadow-dashboard ingest (NYC/other cities). [§20]
- Weekly AI press summary email. 
- Light, ethical gamification ("verified contributor" badge — NOT leaderboard). [§19]
- QR/yard-sign field-organizing deep links (`/report?ref=`).
- Heatmap map layer; nearby sort.

**WON'T (v1)**
- Video upload (frame-extract + video blur) — deferred.
- Auto-merge dedup; predictive maintenance; native app; two-way Open311 sync; voice notes.

---

## 12. AI strategy

**Core (built; harden):** `/api/ai/classify` → `runClassifyPipeline` → Gemini 2.5 Flash → strict JSON. Today prompts for JSON + strips fences + Zod.

**Best practice (research §40):**
- **Structured output**: `generationConfig.responseMimeType="application/json"` + `responseSchema` (per-field `description`, `enum` category, `required`) → guaranteed valid JSON; delete fence hack; keep Zod as *semantic* backstop. Plain flash (no tools) avoids the documented flash-image/tool-call limitation.
- **Classify the RAW image** (`photos-raw`), not blurred — accuracy. Persist `model_version` + `raw_response` for replay (design.md §4.6).
- **Accuracy target grounded in literature:** road-damage CV hits ~74% mAP (YOLOv8) up to 92%+ (RDD2022/CRDDC). Our >90% staff-confirmed target is realistic; keep a `tests/golden/` set; fine-tune later if override rate >20% (design.md §4.5).

**Stretch:** embeddings dedup (§20), recurrence → priority (replace hardcoded ctx, §30 M8), weekly press summary, before/after resolution scoring.

---

## 13. Competitive teardown (research §40)

| Incumbent weakness | Civic counter |
|---|---|
| 2010-era multi-dropdown forms | 2-tap photo submit |
| "AI" = FAQ chatbot | Vision-LLM → costed, routed work order |
| Full anonymity, no contact → can't close loop | Stable anon id + opt-in notify; close-the-loop |
| No subcategory guidance | AI subcategory + staff override → training data |
| Won't publish embarrassing data | **Public scoreboard is the product** |
| Closed ecosystems | Open311 export + shadow ingest |
| Stale cases silently archived | SLA badges + escalation; open>30d surfaced |
| Little spam control | Trust score + dedup + AI-confidence gating (§19) |

---

## 14. Geolocation strategy (reliability, research §40)
Schema requires `location NOT NULL`. Acquire in priority order, no dead-ends:
1. **Device geolocation** (`navigator.geolocation`, high-accuracy) — current default.
2. **EXIF GPS fallback** — if device denied, extract from the photo's EXIF (exif.js, client-only) — many phone photos carry GPS.
3. **Manual address** — reverse/forward geocode via **Nominatim** (1 req/s, attribution + User-Agent required) or **LocationIQ/OpenCage/MapTiler** free tiers (5k/day, 2.5k/day, 100k/mo) for scale. Cache results.
4. **Map pin drop** — last resort, user taps location on the Leaflet map.
Store `neighborhood` (reverse-geocode → district) for the equity dashboard. Strip EXIF from the public photo (privacy) but use it for location first.

---

## 15. Image pipeline (the broken-submit fix + best practice)
**Correct client→server split (fixes audit C1/H4):**
```
[CLIENT] capture → COMPRESS (browser-image-compression / canvas+WebWorker; cap pixels,
         WebP ~25-35% smaller) → BLUR faces/plates (MediaPipe/BlazeFace; fallback) →
         ensure anon session → upload blurred→photos-public, original→photos-raw
         (browser Supabase client so storage RLS sees auth.uid())
[SERVER ACTION] receive {reportId,cityId,location,address,description,tags} →
         insert reports via SSR client (RLS backstop) → runClassifyPipeline(reportId) directly
```
- **Blur upgrade (research §40):** current heuristic blurs top/bottom thirds (misses mid-frame faces, destroys evidence). Use **MediaPipe Face Detector / BlazeFace (TF.js)** for real boxes; conservative full-frame fallback only when detector unavailable. Plates: small TF.js/ONNX model or tighter heuristic + server audit. On-device = nothing unblurred leaves the browser.
- **Compression first** (resize > quality) keeps Gemini cost + storage low and submit fast on 4G.

---

## 16. Offline-first (huge for impact + demo, research §40)
- **Outbox pattern:** on submit, if offline, write the report payload + photos to **IndexedDB**, register **Background Sync** (`sync` event) → service worker replays POST when connectivity returns.
- **Fallback:** Safari/Firefox don't ship Background Sync → also wire an **immediate-retry on `online` event** + on next app open.
- UX: optimistic "Saved — will send when you're back online" toast; my-reports shows `pending` state.
- `sw.js` today is cache-first static / network-first pages — extend with the outbox + a real `/offline` page.
- Demo line: "Report a pothole in a dead-zone parking garage; it syncs when you resurface."

---

## 17. Notifications & email (close-the-loop, research §40)
- **Web Push (PWA):** iOS **16.4+** supports it but only when installed to home screen + permission requested on a **user gesture** + VAPID keys. Store subscriptions (`push_subscriptions`). Notify reporter on `dispatched`/`closed`. Drives the >30% 30-day return-rate KPI.
- **Email via Resend** (Supabase's recommended provider; free 3k/mo, 100/day): custom SMTP for auth magic links (Supabase's built-in is **2/hour, not for prod**) + close-the-loop emails + the weekly press summary to local reporters.
- Trigger from pg_cron/Edge Functions or server actions on status change.

---

## 18. i18n & equity (the 20% ethics score + ADA, research §40)
- **next-intl** (≈2KB, RSC-native, Next 16-compatible): `[locale]` segment, `routing.ts` with `['en','es']`, `setRequestLocale` + `generateStaticParams` per page. Spanish first (Forsyth Co's growing Spanish-speaking population, context.md).
- **Equity dashboard:** resolution time **by neighborhood**; surface gaps — research shows 311 propensity-to-complain varies socio-spatially and inequitable service invites civil-rights scrutiny.
- **Digital-divide outreach hooks:** `/kiosk/[slug]` shared-device mode (library/rec-center/senior-center), **low-bandwidth mode** (skip map tiles, list only), QR yard signs → `/report?ref=`. Mirrors NYC Digital Equity Roadmap tactics.
- Accessibility = equity (see §23).

---

## 19. Trust & safety (research §40 — false reports are the #1 citizen-app risk)
- **No full anonymity:** even anon sessions carry a stable `user.id` (unlike SeeClickFix's contact-less submits) → dedup + rate-limit + reputation attach.
- **Rate limit** 10/hr/user (fix the TOCTOU race + client-set `created_at`, §30 M3) — enforce with a DB function/atomic RPC.
- **Trust score** on `users` — rises with staff-confirmed reports, falls with rejects; gate auto-priority + flag low-trust for review. Research: 2 rejects/30d → review (design.md Appendix B).
- **AI confidence gating:** confidence <0.5 → "needs review" queue; person-not-infrastructure → auto-reject, don't store (design.md).
- **Dedup** prevents pile-on/duplicate spam (§20).
- **Audit log** already tracks staff writes; extend to moderation actions.

---

## 20. Dedup & embeddings (research §40 pgvector)
- Add `reports.embedding vector(768)` (Gemini embeddings) + **automatic embeddings** via Edge Functions + pgmq + pg_cron (Supabase pattern).
- **Near-duplicate** = cosine distance below threshold **AND** `ST_DWithin(location, 50m)` within 30 days. v1 **log-only** into existing `merges` table (incorrect merge is worse than a miss, design.md §7.5); auto-merge at 0.85 after 6 months.
- **Shadow dashboards:** ingest other cities' Open311 (e.g., NYC 311 SODA API — 40M+ rows, 41 columns, daily updates) → comparison scoreboard for cities not yet onboarded.

---

## 21. Realtime
Supabase `postgres_changes` on `reports` per city → live pin drop on browse/map; ensure realtime RLS allows the dashboard-view read; shard by city beyond ~200 concurrent subs (agents.md).

---

## 22. Design system
blue-600 primary, zinc neutrals, severity green→red ramp, dark mode. Inter font. Tailwind v4 + lucide-react; rounded-2xl cards, backdrop-blur headers, pill badges, confidence bars. Motion: active-scale, fly-to, optimistic upvote, realtime pin drop (respect `prefers-reduced-motion`). Voice: lead with outcome, never "AI."

---

## 23. Accessibility & law (research §40)
- **Legal:** ADA **Title II** effective **2026-04-24** makes **WCAG 2.1 AA** law for state/local govts >50k; Section 508 = WCAG 2.0 AA; target **WCAG 2.2 AA** (best practice). This is a *selling point* to cities, not just compliance.
- Semantic HTML, labeled inputs, visible focus, skip-to-content, AA contrast on severity colors, **map list-equivalent**, `prefers-reduced-motion`, keyboard nav end-to-end (staff j/k/↵/esc/d/c/r). Axe in CI; Lighthouse a11y >95.

---

## 24. Performance & Next 16 caching (research §40)
- Lighthouse Perf>90/A11y>95/SEO>95.
- **Next 16 caching is opt-in / dynamic-by-default**; use **PPR** (now stable) for the scoreboard/dashboard — static shell from CDN + dynamic holes streamed. Prefer **tag-based `cacheTag`/`updateTag`** revalidation on report mutations over `revalidatePath` (more precise). `await` async `cookies()/headers()/params`.
- SSG `generateStaticParams` for cities; PostGIS GiST + Supercluster; `next/image` blurred WebP; PWA precache shell + `/offline`.

---

## 25. Security & privacy (ethics)
- Blur on client (§15). Dual bucket; **wire** 30-day raw TTL + privacy audit + signed URLs via **pg_cron + Edge Functions** (≤8 concurrent jobs, ≤10 min each).
- Storage writes folder-scoped to city (migration 006).
- RLS default-deny; SECURITY DEFINER helpers; secrets server-only; constant-time key compares; CSP/HSTS set.
- No PII in URLs; dashboard view strips reporter_id + description.
- **Right-to-be-forgotten** `DELETE /api/account` (design.md §4.8) — anonymize user, sentinel reporter_id, keep public-interest rows. CCPA-aligned (no GA equivalent, but future-proof).

---

## 26. Open311 GeoReport v2 conformance (research §40)
Fix: (1) **lat/long 0,0** → select `ST_AsGeoJSON(location)` via RPC/view; (2) `service_code` filter → `classifications!inner`; (3) datetimes → ISO-8601 `toISOString()`; (4) `service_name` from `services.ts` catalog not title-case; (5) classify call direct/awaited + prod `SITE_URL`; (6) complete XML escaping (`"`,`'`); (7) honor `extensions` param (AI/tags/cost in `extended_attributes`, strict by default); (8) UTF-8 everywhere (spec). Stretch: Open311 *client* ingest (§20).

---

## 27. Data flows
**Report→resolution (corrected):**
```
[client] photo → compress → blur → (offline? outbox+BG-sync) → anon session →
         upload blurred→public, raw→photos-raw (RLS by city folder)
[action] reports.insert(open) via SSR client → runClassifyPipeline(id)
         → download RAW → Gemini structured JSON → classifications(+model_version,+raw)
         → embedding (async) → work_orders(+cost,+sla_due_at) → status=dispatched
[staff] dispatch → in_progress → close(+after photo, AI score) → closed
[resident] push+email + /me/reports "fixed"   [public] Open311→closed; scoreboard++
```
**Upvote:** ▲ → ensure session → toggleUpvote → trigger bumps count → optimistic UI → priority signal.

---

## 28. Components
**Reuse:** report-map, fullscreen-map, map-popup, report-map-lazy, dashboard-interactive (filters), category-chart, stats-cards, recent-reports, city-nav, work-order-row/detail, keyboard-nav, staff-inbox, camera-capture, photo-preview, emergency-interstitial, submission-confirmation, upload, classify-pipeline, gemini, work-order-rules, open311/*, transform, xml.
**Rework:** blur.ts (real detector), report/actions.ts (client/server split + offline), gemini.ts (responseSchema), classify-pipeline (raw bucket + model_version + embedding), open311 routes (conformance).
**New:** /login + anon bootstrap, upvote-button, browse, scoreboard, my-reports, /report/[id], /offline, /kiosk, staff /map //stats //settings //work-order/[id], contacts panel+CRUD, cost compute, tag selector, resolution upload, notes persistence, realtime hook, push registration + sw push handler, IndexedDB outbox + BG-sync, EXIF/geocode util, i18n setup, Resend client, pg_cron jobs, DELETE /api/account, dedup embeddings.

---

## 29. Build phases (dependency-ordered; S/M/L)

```
PHASE 0 — Make it run (CRITICAL first)                      [~0.5d]
 0.1 split submit: client compress+blur+upload, server insert+classify  L
 0.2 classify from photos-raw + persist model_version/raw               S
 0.3 fix staff/page role check + proxy redirect + single role source    S
 0.4 storage RLS folder scoping (migration 006)                         M ← approval
 0.5 /offline page + PWA verify                                         S

PHASE A — Foundation                                        [~1d]
 A1 /login + anonymous bootstrap                                        M
 A2 wire dashboard-data → Supabase (view + GeoJSON RPC)                 M
 A3 Open311 conformance (lat/long, !inner, ISO, service_name, awaited)  M
 A4 Gemini structured output + migrate to @google/genai                 M ← dep approval
 A5 verify resident e2e on real backend                                 M

PHASE B — Resident side                                     [~1.5d]
 B1 migration 005 (tags, upvotes+trigger, neighborhood, embedding col)  M ← approval
 B2 tag selector + EXIF/geocode fallback                                M
 B3 /city/[slug]/browse (reuse filters + map)                           M
 B4 upvote-button (optimistic, login-gated)                             M
 B5 /me/reports + /report/[id]                                          M
 B6 realtime new-pin                                                    M
 B7 offline outbox + Background Sync + retry fallback                   L

PHASE C — Admin side                                        [~1.5d]
 C1 migration 005 (cost_rules, est_cost, sla_due_at, contacts, crews,
    notes, push_subscriptions, trust_score)                            M ← approval
 C2 cost compute + SLA due-at in pipeline                               S
 C3 cost + upvotes + SLA badge in detail/inbox                          M
 C4 /staff/settings (contacts·cost·crews·SLA targets)                   L
 C5 contacts panel; notes persist; resolution upload + AI score; override enum(12) M
 C6 /staff/map + /staff/stats (metric_* + equity + SLA on-time)         L

PHASE D — Wow + reach                                       [stretch]
 D1 /city/[slug]/scoreboard + by-neighborhood equity                    L
 D2 web push + Resend close-the-loop + weekly AI summary                L
 D3 pgvector dedup (log-only) + embeddings cron                         M
 D4 Open311 shadow ingest (NYC/other)                                   L
 D5 i18n Spanish (next-intl) + kiosk + low-bandwidth                    L
 D6 trust score + abuse controls                                        M

PHASE E — Hardening                                         [post-demo]
 E1 wire privacy crons (retention, audit, signed URLs)                  M
 E2 DELETE /api/account (right-to-be-forgotten)                         M
 E3 RLS regression + golden classification + e2e + axe in CI            M
 E4 remove mapbox-gl; bundle/perf pass; Lighthouse                      S
```
**Demo-critical minimum:** Phase 0 + A + B1–B5 + C2–C3 + D1. Add B7(offline) + D2(push) for the showstopper.

---

## 30. Bug / gap register (severity-grouped)

### 🔴 CRITICAL
| # | Issue | File | Phase |
|---|---|---|---|
| C1 | `"use server"` calls browser-only blur + browser client → crash, no blur, submit dead | report/actions.ts, blur.ts, upload.ts | 0.1 |
| C2 | Blur misses mid-frame faces / destroys evidence (thirds heuristic) + never reaches storage | blur.ts | 0.1/§15 |

### 🟠 HIGH
| # | Issue | File | Phase |
|---|---|---|---|
| H1 | No `/login`; submit+staff blocked | — | A1 |
| H2 | Dashboard 100% mock | dashboard-data.ts | A2 |
| H3 | Open311 lat/long always 0,0 (EWKB unparsed) | open311/*, types.ts | A3 |
| H4 | Service-role insert bypasses RLS | report/actions.ts | 0.1 |
| H5 | Storage INSERT allows any path/any city | migrations 001/003 | 0.4 |
| H6 | Classify uses blurred image → low accuracy | classify-pipeline.ts | 0.2 |
| H7 | Open311 POST classify fetch unawaited + localhost fallback | open311/requests/route.ts | A3 |
| H8 | `service_code` filter returns all rows (no `!inner`) | open311/requests/route.ts | A3 |
| H9 | NOT NULL location violated for address-only | report/actions.ts, schema | 0.1/§14 |

### 🟡 MEDIUM
| # | Issue | File | Phase |
|---|---|---|---|
| M1 | Open311 datetimes not ISO-8601; service_name title-cased | transform.ts | A3 |
| M2 | Upsert omits model_version/raw_response → no replay | classify-pipeline.ts | 0.2 |
| M3 | Rate-limit TOCTOU race + client-set created_at | report/actions.ts | 0.1/§19 |
| M4 | Role source divergence (app_metadata vs users.role) | proxy.ts + app | 0.3 |
| M5 | staff/page.tsx `role !== "staff"` redirect — `"staff"` not a valid role → **every staff user bounced to /login; inbox unreachable** (verified) | staff/page.tsx | 0.3/S6 |
| M6 | Notes + resolution upload not persisted | work-order-detail.tsx | C5 |
| M7 | Override enum 8 of 12 categories | staff/actions.ts | C5 |
| M8 | Work-order context hardcoded (school zone/traffic/recurrence) | classify-pipeline.ts | C2/D3 |
| M9 | Deprecated `@google/generative-ai` SDK | gemini.ts, package | A4 |

### 🟢 LOW
| # | Issue | File | Phase |
|---|---|---|---|
| L1 | `/offline` referenced, missing | sw.js, proxy.ts | 0.5 |
| L2 | Redirect to nonexistent `/staff/dashboard` | proxy.ts | 0.3 |
| L3 | escXml misses `"` `'`; null tags emitted empty | open311/requests/route.ts, xml.ts | A3 |
| L4 | Hardcoded `data:image/jpeg` prefix any MIME | report/actions.ts | 0.1 |
| L5 | `mapbox-gl` dep unused | package.json | E4 |
| ~~L6~~ | ~~Stale `middleware.ts`~~ — **FALSE on verify**: no `middleware.ts`, only `proxy.ts` | — | n/a |
| L7 | `/api/auth/logout` referenced by staff layout but route missing | staff/layout.tsx | S5 |
| H3? | Open311 lat/long=0,0 — **serialization-dependent, verify with curl** before trusting | open311/* | A3 |

---

## 31. Demo script (3 min)

> Rewritten 2026-08-30 against routes that exist. The previous version sent
> step 4 to `/staff` (scrapped — it has no page, only server actions; team views
> and `/teams` are canonical) and step 5 to `/city/[slug]/scoreboard`, which was
> never built. Every route below was opened in a browser against the live
> database before this was written.

**Setup:** `VIDEO_PIPELINE=1` and `DEMO_COOKIE_SECRET` set, `pnpm demo:seed`
run, signed in as the **City Admin** persona on the projector. Phone on cellular,
not conference wifi (see the fallback note).

1. **Hook (20s)** — "Cumming waits days for a pothole. Watch." Open the PWA on
   the phone.
2. **Resident (35s)** — `/report`. Two taps to submit. Category and confidence
   come back from the model. Say the privacy line while it classifies: *faces
   and plates are blurred on-device; the unblurred original never leaves the
   phone.* If a nearby report already exists the duplicate-deflection screen
   appears — that is a feature, not a stumble: *"three residents, one ticket."*
3. **Realtime (20s)** — projector on `/city/cumming/map`. The pin is there. Hit
   **Inject report** in the demo control (top-left) if you want a second one to
   land live while they watch.
4. **The differentiator (45s)** — `/city/cumming/grid`. This is the whole pitch:
   not a suggestion, *a costed, routed work order*. Crew, materials, estimated
   minutes, dollar cost, SLA badge, and the AI's rationale. Say it plainly:
   SeeClickFix hands the city a list; we hand them the job. This route is public
   for Cumming, so it works even if the login misbehaves.
5. **Accountability (40s)** — `/city/cumming/analytics`, scroll to **Response
   Equity**. District 1 vs District 2, citywide median, and an explicit
   "underserved = >1.5x median" rule with the councilmember named. No commercial
   311 platform ships this. Note the *Sample data* badge is honest labelling, not
   a caveat to apologise for.
6. **Close (20s)** — "Open311-native, so it feeds the CMMS they already own.
   Free for residents. Fractions of a cent per classification."

**Optional 30s, if the room is engaged:** `/demo/camera` — the bus-camera feed
finding defects and drafting a contractor liability claim, unprompted. It needs
no database and no login, so it is also the safest thing to show if anything
else is misbehaving.

**Fallbacks, in order of preference:**
- A recorded screen capture of steps 2-5. `PITCH_DECK_PLAN.md` recommends this
  over a live app and it is the right call — record it before demo day.
- Anonymous sign-in is per-project and rate-limited by IP. A room full of judges
  on one conference network can collectively trip it, and step 2 then shows
  "wait about a minute". Demo from cellular.
- Everything except step 2 works on seeded data with no writes.

---

## 32. Seed & demo data
Extend `supabase/seed/index.ts`: upvotes, contacts, cost_rules, SLA times, 2 `closed` w/ before/after photos, a couple `open>30d`, neighborhoods for equity, low-trust user for moderation demo. **Commit stable demo photos** so on-stage classification is repeatable. Optionally seed a few NYC-311-derived rows for the shadow-dashboard tease. `pnpm db:seed`.

---

## 33. Testing
Vitest (work-order-rules cost/priority, transform ISO+status, gemini schema, normalizeLocation GeoJSON, dedup distance). RLS regression (tests/rls/: default-deny, cross-city, upvote one-per-user, storage folder scope). Golden classifications (tests/golden/, >90%). Playwright (submit→inbox, upvote, dispatch, **offline queue→replay**). DoD: `typecheck && lint && test`, Lighthouse + axe, privacy audit (no raw in public).

---

## 34. KPIs (design.md §6 + equity/SLA, research §40)
| Metric | Target |
|---|---|
| Time-to-submit P50 | <10s |
| Time-to-triage P50 | <5s |
| Time-to-resolution P50 | <72h |
| Classification accuracy | >90% |
| On-time resolution rate | publish |
| Equity gap (worst vs best neighborhood) | shrink |
| Reporter 30-day return | >30% |
| Offline submit success | ~100% eventual |
| Cost per report | <$0.001 |
| Lighthouse perf | >90 |

---

## 35. ADRs
- **005 Anonymous-first auth** — speed + identity; reject email-gate (slow), fingerprint (spoofable).
- **006 Gemini structured output** — responseSchema; drop fences; Zod backstop.
- **007 Blur on client only** — server can't run canvas/detector; raw never transits unblurred.
- **008 Cost via config rate table** — deterministic, auditable.
- **009 Geo as GeoJSON via RPC/view** — fixes Open311 0,0; PostGIS authoritative.
- **010 Offline outbox + Background Sync (+retry fallback)** — Safari lacks BG-sync.
- **011 next-intl for i18n** — RSC-native, 2KB, Next 16-ready.
- **012 Resend for email** — Supabase built-in is 2/hr; Resend free 3k/mo.
- **013 pgvector dedup, log-only v1** — bad merge worse than miss.

---

## 36. Deps / SDK
Migrate `@google/generative-ai` (deprecated) → `@google/genai`. Add: `next-intl`, `browser-image-compression` (or hand-rolled canvas+worker), `@mediapipe/tasks-vision` or `@tensorflow-models/face-detection`, `web-push` (server), `exifr`/`exif-js`, `resend`. Remove `mapbox-gl` + `@types/mapbox-gl`. Enable Postgres `vector`, `pg_cron`, `pg_net`, `pgmq`. (Dep changes need approval — agents.md "stop and ask.")

---

## 37. Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 0 reveals more broken glue | High | Time-box; seed; e2e early |
| Migration/dep approval delay | Med | Get 005/006 + dep sign-off now |
| On-device blur false-negative | High-impact | MediaPipe + fallback + raw RLS + audit cron |
| iOS push needs install + gesture | Med | Prompt on install; graceful degrade |
| Offline BG-sync unsupported (Safari) | Med | Immediate-retry + on-open replay |
| Geocoder rate limits (Nominatim 1/s) | Med | Cache; LocationIQ/MapTiler fallback |
| Realtime >200 subs/channel | Low | Shard by city |
| Gamification backfires/inequity | Med | Light, ethical, opt-in; no leaderboard (research) |
| Demo network failure | Med | Recorded fallback + seeded data |

---

## 38. Roadmap (post-hackathon)
Predictive maintenance (assets), auto-merge dedup (0.85), full i18n, native app if PWA activation lags, two-way Open311 sync for paid pilots, per-capita pricing ($0.50–$2.00/capita → Cumming $4k–16k, county $125k–500k), voice notes, video.

---

## 39. Open decisions (need owner input)
1. Approve migrations **005 + 006**? (blocks 0.4/B/C)
2. Approve dep changes (**@google/genai**, next-intl, mediapipe, web-push, resend, pgvector)?
3. Anon auth OK for "require login" upvote? (rec yes)
4. `/me/reports` anon-per-device vs email cross-device for v1?
5. Scoreboard + offline + push in demo scope? (rec yes — highest wow)
6. Staff RBAC split dispatcher vs supervisor now or later?
7. License-plate model now (TF.js/ONNX) vs heuristic+audit v1?
8. Spanish i18n in hackathon scope or roadmap?
9. Light gamification ("verified contributor") yes/no? (research mixed — recommend minimal)

---

## 40. Sources (research)

**Open311 / 311 standards**
- GeoReport v2 spec — https://wiki.open311.org/GeoReport_v2/
- GeoReport v2 Extensions — http://wiki.open311.org/GeoReport_v2/Extensions/
- GeoReport v2.1 Draft — http://wiki.open311.org/GeoReport_v2.1_Draft/
- NYC 311 Open Data (SODA API, 41 cols, 40M rows) — https://opendata.cityofnewyork.us/how-to/ · https://catalog.data.gov/dataset/311-service-requests-from-2010-to-2019

**Competitors / market**
- CivicPlus / SeeClickFix 311 CRM — https://www.civicplus.com/seeclickfix-311-crm/ · reviews https://www.capterra.com/p/202342/SeeClickFix/reviews/
- Tyler Enterprise Service Requests — https://www.tylertech.com/products/enterprise-service-requests
- 311 transparency / accountability — https://www.civicplus.com/blog/crm/what-is-a-311-and-citizen-request-management-solution/ · https://ifactoryapp.com/industries/government/citizen-service-request-portal-311-digital-engagement

**Hackathon judging**
- https://eventflare.io/journal/crafting-effective-hackathon-judging-criteria-a-step-by-step-guide · https://pit-un.org/2026-tech-for-change-hackathon/ · https://civic-hacks-2026.devpost.com/

**AI / Gemini / CV**
- Gemini structured output — https://ai.google.dev/gemini-api/docs/structured-output · https://firebase.google.com/docs/ai-logic/generate-structured-output
- Road-damage CV benchmarks (RDD2022, YOLOv8, review) — https://arxiv.org/pdf/2209.08538 · https://link.springer.com/article/10.1007/s44163-025-00297-7 · https://pmc.ncbi.nlm.nih.gov/articles/PMC11397941/

**Privacy / blur / image**
- MediaPipe + TF.js face detection — https://blog.tensorflow.org/2020/03/face-and-hand-tracking-in-browser-with-mediapipe-and-tensorflowjs.html · BlazeFace https://medium.com/data-science/blazeface-how-to-run-real-time-object-detection-in-the-browser-66c2ac9acd75
- Client image compression — https://www.npmjs.com/package/browser-image-compression · https://dev.to/ramko9999/client-side-image-compression-on-the-web-26j7
- EXIF GPS extraction — https://opencagedata.com/guides/how-to-geocode-images · https://fast.io/resources/geolocation-metadata-extraction-from-photos/

**Supabase / Postgres**
- Anonymous sign-in, Realtime, RLS — https://supabase.com/docs/guides/realtime/postgres-changes · https://supabase.com/docs/guides/api/securing-your-api
- pgvector / dedup — https://supabase.com/docs/guides/ai/quickstarts/text-deduplication · https://supabase.com/docs/guides/database/extensions/pgvector · https://supabase.com/docs/guides/ai/automatic-embeddings
- pg_cron / Edge Function scheduling — https://supabase.com/docs/guides/cron · https://supabase.com/docs/guides/functions/schedule-functions · https://supabase.com/blog/processing-large-jobs-with-edge-functions

**PWA / offline / push / email**
- iOS push (16.4+) — https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide · https://www.magicbell.com/blog/using-push-notifications-in-pwas
- Background sync / outbox — https://developer.chrome.com/docs/workbox/modules/workbox-background-sync · https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation · https://michaeltoohig.com/blog/pwa-outbox/
- Resend + Supabase email — https://supabase.com/partners/integrations/resend · https://resend.com/supabase

**Geocoding**
- Nominatim usage policy (1 req/s) — https://operations.osmfoundation.org/policies/nominatim/
- Free geocoder alternatives (LocationIQ/OpenCage/MapTiler) — https://www.rusholiday.com/the-best-free-geocoding-apis-in-2026-and-which-one-actually-fits-your-project/

**Next.js 16**
- Caching / PPR / cacheTag — https://nextjs.org/docs/app/getting-started/caching-and-revalidating · https://www.digitalapplied.com/blog/next-js-15-to-16-migration-playbook-cache-components-2026 · https://www.nandann.com/blog/nextjs-16-2-complete-guide
- next-intl App Router — https://next-intl.dev/docs/getting-started/app-router

**Accessibility / law**
- Section 508 / ADA Title II (2026-04-24, WCAG 2.1 AA) — https://www.section508.gov/develop/applicability-conformance/ · https://www.getstark.co/blog/ada-deadline-government-software-stack/ · https://www.levelaccess.com/blog/ada-vs-section-508-whats-the-difference/

**Equity / trust & safety / gamification**
- 311 equity (socio-spatial complaint propensity) — https://arxiv.org/pdf/1710.02452 · Urban Institute https://www.urban.org/sites/default/files/publication/101360/technology_and_equity_in_cities_1.pdf
- Digital equity roadmaps — https://www.govtech.com/civic/whats-new-in-civic-tech-philadelphias-digital-equity-plan
- Citizen-app false reports / moderation — https://theintercept.com/2020/03/02/citizen-app/ · https://www.datavisor.com/wiki/crowdsourced-abuse-reporting
- Gamification of civic participation (mixed evidence) — https://www.sciencedirect.com/science/article/pii/S0740624X19302606 · https://link.springer.com/article/10.1007/s12652-021-03322-6

---

> "Never lead with the AI. Lead with the outcome." — context.md
