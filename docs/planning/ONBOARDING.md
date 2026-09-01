# City Onboarding: Build Plan

> How a new city goes from "name on a list" to a live, populated dashboard.
> Status: planning. Grounded in current code (read 2026-06-14). Migrations need
> explicit ask per AGENTS.md rule #10. Nothing here is applied yet.
>
> **UI/UX design:** see [ONBOARDING_UI.md](ONBOARDING_UI.md). Wizard screens,
> the async-ingest seam, live preview, tenant list, new primitives, a11y spec.
> **Component specs:** [F1_DATA_LAYER.md](F1_DATA_LAYER.md) · [F4_PROVISION.md](F4_PROVISION.md) · [F5_INGEST.md](F5_INGEST.md).
> **Migration 015 DRAFTED** (not applied): `supabase/migrations/20260614_015_city_config.sql`
>, `reports.source` + nullable `reporter_id`, `cities.{center,default_zoom,parent_id,setup_step}`,
> `boundary`→MULTIPOLYGON, F3 config tables, `provision_jobs`, source-param KPI RPCs.

---

## 0. The reframe: onboarding is two motions, not one signup

The docs are explicit: GTM is **resident-first / pressure-led**, and Civic is
*"the application, not the toolkit"*, **not** a white-label self-serve SaaS
(`docs/planning/context.md`, `design.md` non-goals). So "onboard a city" splits:

| | **Motion A, Launch** | **Motion B, Convert** |
|---|---|---|
| Who runs it | Civic operates it | White-glove + city staff |
| City involved? | No | Yes (signed) |
| Output | Public dashboard at `/city/[slug]` + resident reporting, pre-seeded | Staff inbox, accounts, Open311 two-way sync, branding |
| Purpose | Scale the funnel; **the dashboard IS the sales demo** | Paid official integration ($0.50-2/capita/yr) |
| Goal latency | **Minutes** (self-serve for Civic ops) | Days (guided runbook) |

"Seamless onboarding" = **Motion A in minutes**, which doubles as the pitch:
walk into any of the 283 outreach leads' cities with *their* dashboard already
built. Motion B is a repeatable runbook, not a signup form.

The current product only really supports **one hardcoded city (Cumming)** in
either motion. Everything below is about making city #2..#N cheap.

---

## 1. Current reality: what blocks city #2

Four independent blockers, each code-level not data-level:

| # | Blocker | Evidence | Impact |
|---|---|---|---|
| B1 | **Dashboard data is demo-synthetic, not DB-backed** | `fetchCityStats`/`fetchCategoryBreakdown`/`fetchRecentReports`/`getReportCorpus` all `void cityId` and return an in-memory corpus keyed to `KNOWN_CITIES.cumming.center`, gated by `DEMO_MODE`. `DEMO_MODE=0` → empty. `src/lib/dashboard-data.ts:395-519` | A real city's dashboard renders **blank** even with DB rows |
| B2 | **City registry is a hardcoded code gate** | `KNOWN_CITIES` (only `cumming`) in `dashboard-data.ts:58`. `fetchCity` returns `null` if slug not in it (`:221`). `[team]/[city]/page.tsx:27` + `layout.tsx:26` call `notFound()` if `!(city in KNOWN_CITIES)`. `generateStaticParams` enumerates it. | New city = code edit in ≥3 files, then redeploy, or it 404s |
| B3 | **Per-city config is hardcoded / localStorage, not tenant data** | Departments+routing: `src/lib/teams.ts`. SLA: `CATEGORY_SLA_TARGETS` `dashboard-data.ts:191`. Dept/contact/cost: static arrays in `src/app/staff/settings/page.tsx:5-37`. Routing/team overrides: localStorage (`category-overrides`, `teams-overrides`). | Every city forced into identical config; no customization; overrides are per-browser, not durable or per-city |
| B4 | **No staff provisioning; resident defaults to Cumming** | Staff created only via `supabase/seed/index.ts` or `scripts/create-demo-admin.mjs`. `ensureResidentProfile` hardcodes `slug = 'cumming'` (`src/app/user/actions.ts:42`); same in `app/report/actions.ts`. | No invite flow; **every resident of every city joins Cumming** (multi-tenant correctness bug) |

DB tenancy itself is fine: `city_id` FKs + RLS scoped by `current_user_city_id()`
already exist (`migrations/...001`). The gap is the **app + config layers**, not the schema.

---

## 2. Foundations to build (ordered by leverage)

### F1: Rewire the data layer to Supabase per `city_id` (highest leverage)
> **Full spec:** [F1_DATA_LAYER.md](F1_DATA_LAYER.md), per-fetcher targets (RPCs/view
> from migration 009 already exist), the `reports.source` dependency, call-site impact,
> exit test.
Replace the synthetic corpus path with real queries. `getReportCorpus(cityId)`,
`fetchCityStats(cityId)`, `fetchCategoryBreakdown(cityId)`, `fetchRecentReports(cityId)`
read `dashboard_reports_view` + metric views filtered by `city_id`. Keep the
synthetic generator behind `DEMO_MODE` **only** for the marketing/demo deployment,
parameterized by city center (not hardcoded Cumming). Source of truth = DB.

### F2: City registry as data + dynamic routes
- `listCities()` / `getCity(slug)` from the `cities` table (cache per request).
- Delete `KNOWN_CITIES` as a gate; derive center/zoom from `cities.boundary`
  bbox (add `center geography(POINT)` + `default_zoom int` columns, or compute).
- Replace `notFound()`-on-`KNOWN_CITIES` guards with DB existence + `active`.
- Set `export const dynamicParams = true` and keep `generateStaticParams` as a
  warm-cache hint (live cities), new cities render via ISR with no redeploy.

### F3: Per-city config as data (migration `20260614_015_city_config.sql`)
Move B3's hardcoded config into tenant tables, **seeded from the current TS
defaults** so existing behavior is preserved and a new city inherits a working
template it can override:

```
city_departments (id, city_id, team_id, label, short_label, color, icon, active, contact_email)
category_routing  (city_id, category, team_id)          -- replaces category-overrides localStorage
sla_targets       (city_id, category, hours)            -- replaces CATEGORY_SLA_TARGETS
cost_rules        (city_id, category, est_minutes, materials jsonb, est_cost)
crew_contacts     (city_id, department, crews text, contact_email)
```
- RLS: staff read/write own city only (mirror `reports_*_staff` policies).
- A `default_city_template` (SQL function or seed) applies all rows for a new city.
- localStorage stores become an **optimistic cache** over these tables, not the
  source of truth, so routing/SLA changes persist and are per-city.

### F4: Provisioning engine
> **Full spec:** [F4_PROVISION.md](F4_PROVISION.md), multi-layer TIGER resolve,
> esri/GeoJSON geometry transform, the `boundary` POLYGON→MULTIPOLYGON gap,
> idempotency, config-template applier, security.

`src/lib/onboarding/provision-city.ts → provisionCity({ name, state }): Result<{cityId, slug}>`
Idempotent. Steps:
1. Slugify; geocode + fetch boundary polygon from **Census TIGER/Line** (US
   authoritative municipal limits; OSM Nominatim fallback).
2. Compute center + zoom from boundary bbox.
3. Insert `cities` row (`active=false`, `open311_jurisdiction_id` from input/derived).
4. Apply `default_city_template` (F3 tables).
5. Return ids for the wizard / cold-start step.

### F5: Cold-start ingestion (kills the empty-dashboard problem)
> **Full spec:** [F5_INGEST.md](F5_INGEST.md), NormalizedReport contract, adapters
> (arcgis/synthetic/csv/open311), the writer (bypasses `runClassifyPipeline`, maps
> categories, no vision), `provision_jobs` progress, source-labeling guarantee.

Doc-blessed as the "shadow dashboard" idea (`design.md` roadmap). One normalizer,
several adapters, all tagged `source` so synthetic/imported data **never corrupts
real SLA/KPI numbers**:
- `lib/ingest/open311-import.ts`: pull open service requests from a city's
  existing Open311 endpoint (SeeClickFix/CivicPlus/etc.). Needs the **inverse** of
  `reportToOpen311` (`src/lib/open311/transform.ts` is export-only today).
- `lib/ingest/arcgis.ts`: **primary real-data channel for the GA beachhead**
  (spike §10). Query a city's ArcGIS Feature Service 311/work-order layer over
  REST (`/query?where=…&outFields=*&returnGeometry=true`, paginate on
  `exceededTransferLimit`), reproject EPSG:3857→4326.
- `lib/ingest/socrata.ts`: for big-metro tenants only; **useless for GA targets**
  (spike §10: Socrata 311 publishers are large metros, zero GA leads).
- `lib/ingest/open311-import.ts`: for cities actually on SeeClickFix/CivicPlus
  (sparse in target band; pilot Cumming/Forsyth confirmed *not* on SeeClickFix).
- `lib/ingest/csv.ts`: upload fallback.
- `lib/ingest/synthetic.ts`: **universal fallback** (works for every city incl.
  those with no open data, e.g. the pilot): realistic baseline along the city's
  real road network (OSM ways), for demos. `source='synthetic'`.
- All funnel into `reports` (+ run the existing Gemini classify pipeline or carry
  provided categories) → `classifications` → `work_orders`. Dedup via existing
  `lib/ai/dedup`. **Privacy: any incoming photo goes through blur/raw-bucket, never
  straight to `photos-public`** (AGENTS.md rule #2).

### F6: Staff invites + resident city resolution
- `invites (id, city_id, email, role, token, expires_at, accepted_at)` + magic-link
  (Supabase Auth) + optional `@city.gov` domain allowlist for self-join. Replaces
  `create-demo-admin.mjs`.
- **Fix B4**: resolve a resident's city by `ST_Contains(boundary, geolocation)`
  with a city-picker fallback, instead of hardcoded `'cumming'`.

---

## 3. The seamless flow (Motion A): what fires at each step

```
Civic ops (or lead-gen auto-trigger) enters "City, State"
  └─ provisionCity()                 [F4]  → cities row + config template   (~seconds)
  └─ cold-start ingest               [F5]  → real/synthetic reports         (~1-5 min)
  └─ classify pipeline (existing)          → work orders + costs
  └─ dashboard renders from DB       [F1/F2] at /city/[slug]                 (instant)
  └─ ops reviews preview, flips active=true → public + resident reporting    (1 click)
  └─ generate signage kit (QR → report flow) + share link to the lead
```
Result: any prospect city has a live, populated public dashboard in minutes,
the artifact you put in front of the city manager.

## 4. The conversion runbook (Motion B)
1. City signs (pressure-led; pricing $0.50-2/capita).
2. Confirm/edit config in wizard: departments on/off + rename, per-category SLA &
   cost, crew contacts (writes F3 tables, live-previews).
3. Invite staff (F6) → roles assigned → staff inbox `/staff` populated.
4. Open311 two-way sync (post-v1): ingest becomes continuous; export already
   conforms (`lib/open311/`).
5. Branding + go-live checklist (Lighthouse, RLS tests, privacy audit per
   AGENTS.md "definition of done").

---

## 5. Build phases (ordered; each has an exit test)

| Phase | Goal | Key files / migration | Exit criteria |
|---|---|---|---|
| **P0** | Sell-ready demo onboarding | `provisionCity` (F4) + `synthetic`/`csv` ingest (F5) + `dynamicParams` (F2, partial) | Type a city → populated `/city/[slug]` with no redeploy |
| **P1** | Real data layer | F1 rewire fetchers to DB | `DEMO_MODE=0` city dashboard shows real rows, scoped by `city_id` |
| **P2** | Config as data | migration `015` (F3) + read-site swaps in `teams.ts`/`dashboard-data.ts`/`staff/settings` | Two cities with different departments/SLA render correctly; RLS tests pass |
| **P3** | Staff + residents multi-tenant | F6 (invites + `ST_Contains` city resolution) | New-city staff onboarded by invite; resident of city X joins city X |
| **P4** | Real-source ingest | F5 **ArcGIS adapter first** (GA channel), then Open311 import; Socrata only for big-metro tenants | Pull a GA city's live ArcGIS 311 layer into the dashboard, deduped, reprojected |
| **P5** | Onboarding wizard + tenant admin | `/admin/onboard` multi-step, `/admin/cities` list, `super_admin` gate | Non-engineer Civic ops can provision + go-live without SQL |

**Recommended cut:** ship **P0** first (fastest visible win + the demo weapon),
then **P1 → P2** to make it a product instead of a Cumming fork, then P3/P4/P5.

---

## 6. Tenancy model: DECISION MEMO (county vs city)

**Problem.** `design.md` open Q: Forsyth **County** owns many assets a **city**
report touches (county road through Cumming, county stormwater). And a report can
land near a boundary edge, which tenant owns it? This blocks P3, because resident
city-resolution (`ST_Contains`) needs a deterministic containment rule.

**Options considered.**

| Option | What it is | Cost | Failure mode |
|---|---|---|---|
| **A. Flat tenants** | County and city are independent `cities` rows; no relationship | Zero schema change | Overlapping boundaries → a Cumming address `ST_Contains`-matches *both* Cumming and Forsyth → ambiguous routing, double-counted KPIs |
| **B. Parent/child** (recommended) | Add nullable `cities.parent_id`; city points to its county | 1 column + 1 index | Slightly more complex resolution query; need to seed parent links |
| **C. Asset-ownership table** | Per-asset `owner_jurisdiction` (county road vs city road) drives routing | New `asset_ownership` table + GIS road-ownership data per city | Heavy; needs authoritative road-ownership layer Civic doesn't have at onboarding time |

**Decision: B (parent/child), with a C-lite escalation hook.**

- Add `cities.parent_id uuid null references cities(id)`.
- **Containment rule (deterministic):** resolve a report/resident to the
  **smallest-area** `cities` row whose `boundary` contains the point
  (`ORDER BY AREALAND ASC LIMIT 1`, TIGER gives `AREALAND` directly, spike §10).
  City beats county because city area < county area. Kills option-A ambiguity
  with no extra data.
- **Escalation hook (defer the hard part):** when a city report's category maps to
  a county-owned asset, route/escalate to `parent_id`. v1 = a per-category
  `escalates_to_parent bool` flag on `category_routing` (F3) set during Motion-B
  config, *not* a full asset-ownership GIS layer. Option C can layer on later by
  intersecting a road-ownership feature service (same ArcGIS REST pattern as F5).

**Why not C now:** authoritative per-asset ownership requires a road-ownership GIS
layer per city that doesn't exist at provision time; it would block onboarding on
data Civic can't get in 10 minutes. The flag-based escalation captures 90% of the
value (the known county-road categories) at ~0 cost. **Revisit C** only if a buyer
demands precise jurisdiction splitting.

**Sequencing:** the `parent_id` column rides in migration `015` (F3). The
smallest-area containment rule is required for P3; the escalation flag is P4-era.

---

## 7. Risks / guardrails

- **Synthetic vs real data must never mix in KPIs.** Hard wall via `source`
  column; analytics filters `source='resident'|'open311'` for real metrics.
- **`generateStaticParams` + new city** → without `dynamicParams=true` a
  provisioned city 404s until rebuild. P0 correctness item.
- **Demo-mode creds**: plaintext demo auth must stay gated `NODE_ENV !== 'production'`
  (team-view spec risk). Don't let onboarding paths leak it to prod.
- **Open311 import privacy**: incoming media through blur/raw-bucket path only.
- **Boundary quality**: TIGER primary (authoritative), OSM fallback.
- **Config migration is the long pole** (P2 touches many read sites), it's the
  line between "demo" and "multi-tenant product."

---

## 8. GTM tie-in

Cold-start fill (F5) is the lead-gen weapon: pre-seed any of the 283
`civic_outreach.csv` leads' real cities, then the discovery call opens with their
dashboard already live. Onboarding mechanism = sales mechanism. The `MUNICIPALITIES`
"Soon" list (`dashboard-data.ts:86`) is the visible rollout: flipping `live:false→true`
is exactly the P0→go-live step.

---

## 9. Open questions to resolve before building

1. ~~County-vs-city tenancy model~~, **DECIDED** (§6: parent/child + smallest-area
   containment + escalation flag).
2. Motion-A public launch consent/notice, **DECIDED (default) + FLAGGED (counsel).**
   Two tiers: (a) **demo/preview is PRIVATE** by default (`active=false`, tokened
   share link), a sales artifact, no public exposure, no consent needed; **synthetic
   data never goes public**. (b) **True public launch** (residents reporting at
   `/city/[slug]`, SEO-indexed) requires city opt-in **or** a clearly-labeled
   community/unofficial mode that does not impersonate the city. Publishing a
   city-branded dashboard without consent is a PR/legal risk → **flag for counsel**
   (ties to research "legal landmine register"). Resolves the build default; the
   public-without-consent posture stays a business/legal call.
3. Per-city SLA/cost defaults, **DECIDED: one national template, per-city override.**
   Defaults are starting points the city edits in wizard Step 4 anyway; per-state
   tables add maintenance for little day-1 value. Revisit regional **cost** tables
   (labor/materials vary) only if buyers push back. Cheap, reversible.
4. Import-scale classification. **DECIDED: map, don't re-classify.** (a) Synthetic
   is generated *with* known categories, no classification. (b) Imported ArcGIS/
   Open311/CSV already carry categories + usually **no photos** → deterministic
   **map source category → Civic taxonomy**; skip the vision pipeline (re-running
   vision on text-only records is pointless). (c) Full Gemini vision runs only on
   **new resident reports** post-launch (photo is the input). Cost is trivial either
   way (batch ≈ $0.0011/report), but mapping makes cold-start **faster**. The 1-5 min
   is fetch+insert+work-order-gen, not per-record LLM. Batch the work-order-gen.
5. ~~Open311 endpoint discovery~~, **DECIDED: manual + auto-try, no registry v1.**
   Step 1 lets the operator paste an ArcGIS FeatureServer URL if known; else
   auto-search ArcGIS Hub by city name; else synthetic. Operator confirms/overrides
   in Step 2. A cached per-city source registry is a P4+ optimization.

---

## 10. External-data spike results (verified live 2026-06-14)

Ran live probes against the external services the plan rests on, sampling the
real lead cities from `leadgen/wave3_gov_ga_metro.json` (Roswell, Sandy Springs,
Alpharetta, Marietta, Athens-Clarke, Augusta, Columbus, Savannah/Chatham,
Macon-Bibb + pilot Cumming). Goal: validate or kill the cold-start premise before
writing ingest code.

### Finding 1: TIGER boundary fetch WORKS (provisionCity is viable today)
- Service: `tigerweb.geo.census.gov/.../Places_CouSub_ConCity_SubMCD/MapServer`,
  **layer 4 = Incorporated Places**.
- Query gotcha: `NAME='Cumming city'` (Census appends the LSAD suffix " city"),
  `STATE='13'` (GA FIPS). GEOID `1320932`.
- One call returns **everything provisionCity needs**: boundary polygon
  (`returnGeometry=true`, ~151 KB of rings for Cumming), **center for free** via
  `INTPTLAT/INTPTLON` (`+34.2061 / -84.1338`, correct), and `AREALAND` (19.77 km²,
  → drives default zoom *and* the smallest-area containment rule in §6).
- **Implication:** F4 needs no geocoder + no bbox math. TIGER is the single source.
  OSM fallback only for non-US / unincorporated edge cases. Confirms §7 "TIGER primary".

### Finding 2: Socrata is the WRONG channel for the GA beachhead
- Socrata catalog (`api.us.socrata.com/api/catalog/v1?q=311 service requests`)
  311 publishers are **large metros only**: Chicago, LA, Dallas, NYC, Montgomery
  County MD, Cincinnati, Oakland, Seattle, Miami, KC, Cambridge, Baton Rouge.
- **Zero GA lead cities.** Apparent GA hits were false positives, `data.calgary.ca`
  (matched "ga") and Gainesville **FL**.
- **Implication:** demote `socrata.ts` to big-metro tenants only. Don't build it
  for the GA GTM.

### Finding 3: ArcGIS IS the real-data channel (cold-start premise SURVIVES)
- ArcGIS Hub (`hub.arcgis.com/api/v3/datasets`) returns real resident-311 +
  work-order layers: `Citizen311ServiceRequest`, `311 Service Request Map`,
  `Pothole List`, `Streets - All Complete Pothole WOs` (fields `Incident_ID`,
  `Status`, `Category_ID`, `WorkOrderId`, `ActualFinishDate`).
- Verified a live endpoint is queryable like any feature service:
  `services.arcgis.com/8Pc9XBTAsYuxx9Ny/.../311_Service_Request/FeatureServer/0`
  → **280,011 records**, point geometry (EPSG:3857 → reproject to 4326),
  standard `where`/`outFields`/pagination (`exceededTransferLimit` → `resultOffset`).
- **Caveat (honest):** the Hub full-text query is loose, results mixed in San Jose
  CA and DC GIS, so this proves *the mechanism and that city 311 feature services
  exist and are pullable*, **not** that every GA lead publishes one. Coverage is
  uneven and must be confirmed per city at provision time.
- **Implication:** `arcgis.ts` is the primary ingest adapter (same REST shape as
  the TIGER probe, low new-tech risk). Open311 import drops to "where a city is on
  SeeClickFix/CivicPlus" (sparse; pilot is not).

### Finding 4: county & consolidated boundaries work, but the name format is messy⚠
Several gov leads are **counties** (Chatham, Forsyth, Houston, Dougherty) or
**consolidated city-counties** (Athens-Clarke, Augusta-Richmond, Macon-Bibb,
Columbus-Muscogee), not plain cities. Verified all are fetchable, but across
**different layers with different LSAD suffixes**: string-matching one suffix breaks:

| Type | Layer | Example NAME | GEOID |
|---|---|---|---|
| Incorporated place | `Places…/MapServer/4` | `Cumming city`, `Columbus city` | 7-digit |
| Consolidated gov | `Places…/MapServer/3` | `Athens-Clarke County unified government`, `Augusta-Richmond County consolidated government` | 7-digit |
| Consolidated (balance) | layer 4 | `Augusta-Richmond County consolidated government (balance)`, `Macon-Bibb County` | 7-digit |
| County | `State_County/MapServer/1` | `Chatham County` | 5-digit |

- **Implication for F4:** `provisionCity` must do a **multi-layer resolve**,
  query Incorporated Places (4) + Consolidated Cities (3) + Counties (1) [+ CDPs (5)]
  with `UPPER(NAME) LIKE '<input>%' AND STATE=<fips>`, collect candidates across
  layers, and **let the wizard's Boundary step disambiguate** when >1 matches (e.g.
  `Columbus city` vs a county; `Macon-Bibb County` vs `Macon`). No fixed-suffix match.
- **Implication for §6 tenancy:** consolidated govs (Athens-Clarke etc.) are
  **single-tenant** (city = county already merged) → no `parent_id`. Only separate
  cities-within-counties (Cumming/Forsyth, Roswell/Fulton) use the parent/child model.

### Net plan delta
1. **Ingest priority reordered** (F5): ArcGIS → CSV → Open311 → Socrata(metro-only),
   with **synthetic as the universal fallback** because the pilot and small cities
   may publish *nothing*. Cold-start is never blocked.
2. **F4 = multi-layer TIGER resolve** (Finding 4): no geocoder, but query 3-4 layers,
   match by name+state, disambiguate ambiguous hits in the wizard Boundary step.
3. **§6 unblocked:** TIGER `AREALAND` is the field the smallest-area containment
   rule needs.
4. **Per-lead reality:** can't assume any given lead has pullable data → synthetic
   must ship in P0 (it already is the P0 plan); ArcGIS enrichment is opportunistic.
