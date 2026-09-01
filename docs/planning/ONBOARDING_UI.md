# City Onboarding — UI/UX Design

> The screens, states, and interaction model for "city name → live populated
> dashboard in minutes." Companion to [ONBOARDING.md](ONBOARDING.md) (the data/
> build plan). Grounded in the existing app's design system (read 2026-06-14).
> Status: design. No code written yet.

---

## 0. Design principles (the 5 that drive every screen)

1. **Match the house style, don't invent one.** Apple-inspired dark system already
   exists — tokens in [globals.css](../../src/app/globals.css), primitives in
   [src/components/ui/](../../src/components/ui/). The wizard reuses Button/Card/
   Badge/Accordion/Drawer and the dashboard components verbatim. No new palette,
   no new font. (design.md is silent on visual identity → the code *is* the spec.)
2. **The wait is hidden behind work.** Provisioning is seconds (TIGER boundary +
   config template). Cold-start ingest+classify is the slow 1–5 min part. **Run it
   as a background job and walk the operator through config while it runs** — by the
   time they reach Preview, the data has landed. Seamlessness = overlap, not spinners.
3. **One wizard, two exits.** Motion A (demo/funnel): accept template defaults, skip
   to **Preview → Share link** (`active=false`). Motion B (signed city): full config
   + invites → **Go live** (`active=true`). Same flow, two terminal actions.
4. **Everything reversible until Go-live.** Provisioning a city is non-destructive
   (`active=false`, invisible publicly). Only the final Go-live flips it public —
   that's the one confirm-gated, hard-to-reverse action.
5. **It's a demo even when it's a tool.** This runs in front of a city manager, so
   it gets demo polish: the dashboard preview is the pitch (ONBOARDING.md §8).

---

## 1. Information architecture & routes

New `/admin` section, gated behind a `super_admin` role (reuse `admin` + allowlist
for v1). Admin shell **mirrors the existing staff layout** (`src/app/staff/layout.tsx` at
the time of writing) — fixed left sidebar (desktop) / top bar (mobile), same
auth-guard pattern.

> **Since shipped:** the `/staff` route UI was scrapped (see `agents.md`,
> "Layout & current state"), so that file no longer exists. What was built is
> [`src/app/admin/layout.tsx`](../../src/app/admin/layout.tsx); the surviving
> staff-shaped shell is [`src/app/city/[slug]/layout.tsx`](../../src/app/city/%5Bslug%5D/layout.tsx).

```
/admin                       → redirect to /admin/cities
/admin/cities                → tenant list (all cities, status, go-live toggle)
/admin/onboard               → the wizard (new-city flow)
/admin/cities/[slug]         → tenant detail / re-enter wizard at any step
```

Sidebar nav (new, mirrored `src/components/staff/sidebar-nav.tsx`, since
removed with the `/staff` UI — it shipped as
[`src/components/admin/sidebar-nav.tsx`](../../src/components/admin/sidebar-nav.tsx)):
`Cities` (list), `Onboard` (+ new), back-link to `/staff`. Icon set = lucide
(`Building2`, `PlusCircle`, `LayoutDashboard`).

---

## 2. The wizard — step model

Seven logical stops; **only step 1 is required** before the background job starts.
Steps 3–5 are skippable (smart defaults from the config template, ONBOARDING.md F3).

| # | Step | Required? | Writes | While you're here… |
|---|------|-----------|--------|---------------------|
| 1 | **Identify** — City, State | ✅ | `cities` row (`active=false`) via `provisionCity()` | …job kicks off |
| 2 | **Boundary** — confirm on map | ✅ (1-click) | confirms `cities.boundary` | …ingest running |
| 3 | Departments — toggle/rename | skip→defaults | `city_departments` | …ingest running |
| 4 | Routing & SLA & cost | skip→defaults | `category_routing`,`sla_targets`,`cost_rules` | …classify running |
| 5 | Invite staff | skip (Motion A) | `invites` | …classify finishing |
| 6 | **Preview** — live dashboard | ✅ | nothing | data has landed |
| 7 | **Launch** — Share or Go-live | ✅ | `active`, signage kit | terminal |

### Wizard shell (persistent across steps)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◐ Building Cumming, GA …  ·  312 reports ingested · classifying 240/312 │ ← status bar (aria-live=polite)
├──────────────────────────────────────────────────────────────────────┤
│  ① Identify ─ ② Boundary ─ ③ Depts ─ ④ Rules ─ ⑤ Invite ─ ⑥ Preview ─ ⑦ Launch │ ← Stepper (NEW)
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   [ step content — single Card, max-w-2xl, centered ]                  │
│                                                                        │
├──────────────────────────────────────────────────────────────────────┤
│  ‹ Back                                   Skip step   [ Continue → ]    │ ← footer (Button isPending)
└──────────────────────────────────────────────────────────────────────┘
```

- **Stepper** = new primitive. Completed = filled `#0a84ff` dot + check; current =
  ring; future = muted `#86868b`. `<nav aria-label="Onboarding steps">` + `<ol>`,
  `aria-current="step"` on active. Clickable to revisit completed steps (keyboard
  reachable, Enter/Space).
- **Status bar** = the async job (see §3). Always visible once the job starts;
  collapses to a single line. `aria-live="polite"` so SR users hear progress.
- Footer buttons reuse existing `Button` (`isPending` spinner for server actions).
  `Skip step` hidden on required steps. Forward is `accent` (blue), Back is `ghost`.

---

## 3. The async ingest UX (the seam — this is what "seamless" means)

**Problem:** cold-start ingest+classify takes 1–5 min. A spinner that long reads as
frozen. **Solution:** non-blocking background job + progress surfaced ambiently +
the operator kept busy with config.

### Job lifecycle (surfaced in the status bar)

```
Provisioning ▸ Boundary ✓ ▸ Ingesting (ArcGIS/synthetic) ▸ Classifying n/m ▸ Ready ✓
   <1s            <2s              ~10–60s                    ~1–4 min      done
```

- Kicked off the instant step 1 submits. Operator never waits on it — they advance
  to Boundary/Depts/Rules immediately.
- **Transport:** reuse **Supabase Realtime** (already a dependency; research K4
  confirmed it scales) — subscribe to a `provision_jobs` row, update the status bar
  on change. Fallback: poll a `getProvisionStatus(cityId)` server action every 2s.
- **States in the bar:**
  - *running* → `◐` spinning glyph (motion-safe) + live counts, blue.
  - *partial/degraded* → `⚠` amber: "No ArcGIS source found — filled 200 synthetic
    reports" (honest, never silent). Links to swap source / upload CSV.
  - *ready* → `✓` green "Cumming is ready to preview" + auto-nudge to step 6.
  - *error* → `role="alert"` red + **Retry** + **Continue with what loaded** (error
    recovery path, never a dead end).
- **Synthetic labeling is load-bearing** (ONBOARDING.md §7): synthetic reports carry
  a persistent `Badge variant="warning"` "Demo data" in preview, and the status bar
  says so. Never let a buyer mistake synthetic for real.

### Why this is seamless
The 1–5 min cost is paid *during* the 1–5 min of config the operator was going to do
anyway. Perceived wait ≈ 0. If they skip all config (Motion A speed-run), the Preview
step shows a **streaming fill** (skeletons → cards populate as classify completes)
instead of a blank wait — Suspense boundary + Realtime, see §4.

---

## 4. Step screens (layout + states)

### Step 1 — Identify
```
   Add a city
   ───────────────────────────
   City name   [ Cumming            ]
   State       [ Georgia        ▾   ]
   ┌ optional ────────────────────┐
   │ Open311 jurisdiction id  [  ] │
   │ ArcGIS source URL        [  ] │  ← if known; else auto-discover/synthetic
   └──────────────────────────────┘
                         [ Provision city → ]
```
- New `Input` + `Select` primitives (none exist — §6). `type="text"`, state is a
  `<select>` of 50 states, `<label for>` on each (a11y critical).
- On submit: `provisionCity()` server action → **multi-layer TIGER lookup** (Places +
  Consolidated + Counties [+ CDPs], match `LIKE name% AND STATE=fips`). ArcGIS source:
  if pasted, use it; else auto-search ArcGIS Hub by city name; else synthetic.
  **Loading:** button `isPending`. **Error:** zero TIGER matches → `role="alert"`
  "No Census match for 'Xville, GA' — check spelling or [enter boundary manually]."
  **Success:** advance to Step 2 (disambiguate if multiple) + job starts.
- Empty state of the whole wizard = this step. No data yet, nothing to show.

### Step 2 — Boundary confirm + disambiguate (NOT draw)
```
   Which Cumming?  (2 Census matches)            ← only shown when >1 candidate
   ⦿ Cumming city        · place    · 19.8 km²   ← radio list of TIGER candidates
   ○ Cumming (CDP)       · cdp      · 22.1 km²
   ┌────────────────────────────────────┐
   │            [ map: selected polygon  │   ← maplibre, fitBounds to boundary
   │              outlined in #0a84ff ]  │      read-only overlay, updates on pick
   │      center ● 34.206, -84.134       │
   └────────────────────────────────────┘
   Area 19.8 km² · pop ~7,300 (Census)        [ Confirm boundary → ]   [ None of these ]
```
- **Multi-layer resolve** (ONBOARDING.md §10 Finding 4): Step 1 collected candidates
  across Incorporated Places / Consolidated / Counties layers. If exactly one →
  auto-select, this is a 1-click confirm. If >1 (e.g. `Columbus city` vs a county;
  city vs CDP) → radio list, map updates on selection. Each row shows name + type +
  area so the operator picks correctly.
- **Reuses existing maplibre setup** (ReportMap base). Renders the fetched polygon —
  **no map-draw library v1** (TIGER authoritative).
- **"None of these"** → manual lat/lng/radius fallback (rare: non-incorporated /
  non-US). **Loading:** `.skeleton` map while polygon fetches. **Error:** geometry
  fetch failed → retry. **Empty** (zero TIGER matches): straight to manual fallback.

### Step 3 — Departments
```
   Departments (11 from template — toggle or rename)
   ┌──────────────────────────────────────────┐
   │ ⊙ Streets & Roads        [Streets…]  ⋮    │  ← reuse team-setup-modal patterns
   │ ⊙ Stormwater & Drainage  [Storm…]    ⋮    │
   │ ○ Parks (off)            [Parks]     ⋮    │  ← toggle = Switch (NEW), color dot
   └──────────────────────────────────────────┘
                                  [ + Add department ]
```
- Pre-filled from the config template ([teams.ts](../../src/lib/teams.ts) defaults).
  Reuses [team-setup-modal.tsx](../../src/components/teams/team-setup-modal.tsx)
  icon-picker + color logic. Needs a `Switch` (new) for active toggle.
- **Skippable** → all 11 defaults stay on.

### Step 4 — Routing, SLA & cost
- Reuse [routing-matrix.tsx](../../src/components/teams/routing-matrix.tsx) for
  category→team. SLA + cost = simple number `Input`s per category in a table.
- **Empty/skip** → template defaults (one national template for v1; per-state is an
  open Q in ONBOARDING.md §9).
- Inline validation: SLA hours `type="number" min=1`, error *under the field*
  (skill: error placement near problem, not top-of-form).

### Step 5 — Invite staff
```
   Invite your team (optional)
   [ marty@sandyspringsga.gov           ] [ Public Works ▾ ]  [ + ]
   ─ pending ─────────────────────────────────────────────────
   marty@…  Public Works   ⏳ invite queued                    ✕
   Allowlist domain: [ @cityofX.gov ]  → anyone with this email can self-join
```
- Writes `invites` (ONBOARDING.md F6). Magic-link. **Motion A skips this entirely.**
- Each pending row = `Badge`. Remove = icon button with `aria-label="Revoke invite"`.

### Step 6 — Preview (the pitch)
```
   Cumming — live preview                         [Demo data] badge if synthetic
   ┌──────────┬──────────┬──────────┬──────────┐
   │ Total    │ Open     │ Resolved │ Avg time │   ← <StatsCards> (existing)
   └──────────┴──────────┴──────────┴──────────┘
   ┌──────────────────────────┬───────────────┐
   │  <ReportMap> (existing)   │ <RecentReports>│
   │                           │  (existing)    │
   └──────────────────────────┴───────────────┘
   <CategoryChart> (existing)
                       [ ‹ Open full dashboard ↗ ]   [ Continue to launch → ]
```
- **Reuses dashboard components unchanged** — `StatsCards`, `RecentReports`,
  `CategoryChart`, `ReportMap`. This is why F1 (real DB data layer) must precede a
  truthful preview: the components must read this city's `city_id`, not the Cumming
  synthetic corpus.
- **Streaming fill:** wrap each panel in `<Suspense>` with the existing `.skeleton`
  shells ([city/[slug]/loading.tsx](../../src/app/city/[slug]/loading.tsx)); panels
  populate as classify completes (Realtime revalidate). No blank wait even on speed-run.
- **Empty state** (job still 0 reports): friendly "Filling Cumming with sample data…"
  not an empty grid (skill: content-jumping / reserve space).

### Step 7 — Launch
```
   Two ways to launch Cumming
   ┌───────────────────────────┐   ┌───────────────────────────┐
   │  Share preview            │   │  Go live  (irreversible-ish)│
   │  Stays private (active=    │   │  Public at /city/cumming,   │
   │  false). Get a link for    │   │  residents can report.      │
   │  the sales call + QR kit.  │   │  Flips active=true.         │
   │       [ Copy link ]        │   │     [ Go live → ] (confirm) │
   └───────────────────────────┘   └───────────────────────────┘
```
- **Share** (Motion A): generates a tokened preview URL + downloadable signage kit
  (QR → report flow). No public exposure.
- **Go live** (Motion B): **confirm dialog** (new Modal) — "Publish Cumming publicly?
  Residents will be able to submit reports." Destructive-style confirm. After:
  `revalidatePath('/city/cumming')`, success `Toast`, redirect to `/admin/cities`.

---

## 5. `/admin/cities` — tenant list

```
   Cities                                                  [ + Onboard a city ]
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ City            State  Status      Reports  Source     Go-live           │
   │ Cumming         GA     ● Live      1,204    resident   ▣ on              │
   │ Roswell         GA     ◐ Preview     312    synthetic  ▢ off  [Open ↗]   │
   │ Sandy Springs   GA     ◌ Draft        0     —          ▢ off  [Resume]   │
   └─────────────────────────────────────────────────────────────────────────┘
```
- Semantic `<table>` (skill: data-table for a11y) with `scope="col"` headers.
- Status `Badge`: Live (green) / Preview (amber) / Draft (muted) / Error (red).
- Go-live toggle = `Switch` with confirm on flip-to-live. `Source` shows
  resident/arcgis/synthetic so synthetic tenants are never mistaken for live.
- Row actions: Open dashboard (↗), Resume wizard (jumps to last incomplete step).
- **Empty state:** "No cities yet — [Onboard your first city]."

---

## 6. NEW primitives to build (and what to reuse)

| Primitive | Why | Reuse base / pattern | Effort |
|-----------|-----|----------------------|--------|
| **Stepper** | wizard progress + a11y `aria-current` | new; `<ol>` + tokens + pill-slide motion | S |
| **JobProgress / StatusBar** | the async seam | new; Realtime sub + `aria-live`; the load-bearing piece | M |
| **Toast** | go-live success, invite sent, errors | new (Sonner-like) or portal like [bottom-sheet](../../src/components/ui/bottom-sheet.tsx); `role="status"` | M |
| **Modal/Dialog** | go-live confirm | new — only Drawer/BottomSheet exist; same portal+scroll-lock+focus-trap pattern | S |
| **Input / Select / Field** | wizard forms | new; wrap HTML + label + error slot + tokens; `type=email/tel/number` | M |
| **Switch** | dept toggle, go-live | new; small; tokenized | S |
| **FileDrop** | CSV ingest fallback | new; native input + drag zone | S |
| Map boundary view | step 2 | **reuse** ReportMap (no draw lib) | S |
| ~~map-draw~~ | — | **NOT needed v1** (TIGER authoritative); defer to OSM/manual fallback | — |

Everything else (Card, Badge, Button+isPending, Accordion, Drawer, skeleton,
fade-up/stagger motion, dashboard panels) is **reused as-is**.

---

## 7. States matrix (every screen needs all four)

| Screen | Loading | Empty | Error | Success |
|--------|---------|-------|-------|---------|
| Identify | button isPending | (is the empty state) | `role=alert` TIGER miss + manual fallback | advance + job starts |
| Boundary | `.skeleton` map | n/a | geometry retry | "Looks right" |
| Depts/Rules/Invite | inline | template defaults shown | field-level errors | saved (optimistic) |
| Job/StatusBar | `◐` + live counts | "Starting…" | red + Retry / Continue-partial | `✓` green nudge |
| Preview | Suspense skeletons | "Filling with sample data…" | per-panel retry | populated + Demo badge |
| Launch | button isPending | n/a | toast error | toast + redirect |
| Cities list | route `loading.tsx` | "No cities yet" CTA | toast | live table |

---

## 8. Accessibility & keyboard (Lighthouse A11y > 95 — hard bar, design.md:31)

- **Semantic first:** `<nav><ol>` stepper, `<table>` tenant list, `<form>`+`<label
  for>` every field, `<button>` not `<div role>`. (web-guideline: semantic before ARIA.)
- **Focus:** `:focus-visible` ring (`ring-2 ring-[#0a84ff]`) on all interactive els;
  never `outline-none` without replacement (CRITICAL rule). Stepper + toggles keyboard-
  reachable.
- **Async announced:** status bar `aria-live="polite"`; errors `role="alert"`;
  toasts `role="status"`. (No silent state changes — the whole async story must reach SR users.)
- **Icon buttons** (revoke invite, copy link, map controls) → `aria-label`; decorative
  icons → `aria-hidden`.
- **Color never sole signal:** status uses Badge text + icon + color (Live/Preview/Draft),
  not color alone.
- **Tab order = visual order**; wizard footer reachable; `Esc` closes modal/drawer;
  focus restored on close (existing scroll-lock/focus pattern).
- **Reduced motion:** all new motion behind `motion-safe:` / respects
  `prefers-reduced-motion` (already global in globals.css).
- Inputs ≥16px on mobile (no iOS zoom), touch targets ≥44px (matches existing).

---

## 9. Motion (reuse existing tokens — no new system)

- Step transitions: `.fade-up` / route fade already defined. Stepper dot fill: pill-
  slide easing `cubic-bezier(0.22,1,0.36,1)`, 200ms.
- Preview panels: existing bento `.stagger-children` reveal as they stream in.
- Go-live success: reuse the GSAP checkmark pop from
  [submission-confirmation.tsx](../../src/components/report/submission-confirmation.tsx).
- Job glyph spin: `motion-safe:animate-spin`, 150–300ms micro-interactions elsewhere.

---

## 10. Build order (maps onto ONBOARDING.md phases)

| UI deliverable | Depends on | Phase |
|----------------|-----------|-------|
| Admin shell + `/admin/cities` (read-only) + Stepper + Input/Select/Modal/Toast | — | P0 |
| Wizard steps 1–2 + JobProgress + step 6 Preview (synthetic) | `provisionCity` (F4), synthetic ingest (F5), data layer (F1) | P0→P1 |
| Steps 3–5 (config + invites) | config tables migration 015 (F3), invites (F6) | P2→P3 |
| Step 7 Go-live + signage kit + Share-preview token | dynamicParams (F2) | P3 |
| ArcGIS source picker in step 1 + degraded states | arcgis adapter (F5) | P4 |
| Full `/admin/onboard` self-serve polish, resume-wizard | all | P5 |

**MVP screen cut (sell-ready):** Admin shell + Cities list + Wizard steps 1, 2, 6, 7
(Identify → Boundary → Preview → Share). Skips all config (template defaults). That
alone is the "type a city → live populated preview → share link" demo.

---

## 11. UI decisions (resolved 2026-06-14)

1. **Toast vs inline** — **DECIDED: both.** Minimal `Toast` (`role="status"`) for
   non-blocking confirmations away from the action (go-live, invite-sent); inline
   field-level errors for forms.
2. **Resume model** — **DECIDED: DB.** `cities.setup_step int` (+ draft state) so
   `/admin/cities` "Resume" deep-links to the last incomplete step. Survives refresh,
   matches "config as data."
3. **JobProgress transport** — **DECIDED: Realtime primary, poll fallback.** Supabase
   Realtime already in stack (research K4: scales); 2s poll of `getProvisionStatus()`
   if Realtime drops.
4. **Boundary resolution** — **DECIDED: multi-layer TIGER resolve + Step-2
   disambiguation** (ONBOARDING.md §10 Finding 4). Step 1 queries Places + Consolidated
   + Counties [+ CDPs]; Step 2 shows candidate(s) for the operator to pick/confirm.
   Manual lat/lng/radius fallback **only** when zero TIGER matches (rare: non-incorporated
   / non-US). **No map-draw library v1.**
5. **super_admin gate** — **DECIDED: `admin` + allowlist for v1** (no migration);
   formal `super_admin` role at P5.
```
