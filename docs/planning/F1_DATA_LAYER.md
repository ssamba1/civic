# F1: Data-Layer Rewire (synthetic corpus → Supabase per `city_id`)

> The #1-leverage foundation from [ONBOARDING.md](ONBOARDING.md) F1. Today every
> dashboard fetcher ignores `cityId` and returns an in-memory synthetic corpus
> keyed to Cumming. This spec rewires them to real Supabase rows, scoped per city,
> so a provisioned city's dashboard shows its own data (and the onboarding Preview
> is truthful). Grounded in code + schema read 2026-06-14. No code written yet.

---

## 0. TL;DR: smaller than it looks

**The DB path already exists.** Migration `009` shipped exactly the server-side
primitives this needs, all granted to `anon`+`authenticated` (public dashboard works
unauthenticated):

- RPC `city_stats(_city_id uuid)` → `total, open_count, resolved, this_week, prev_week, avg_hours`
- RPC `city_category_breakdown(_city_id uuid)` → `category, count`
- View `dashboard_reports_view` → per-report rows with `lng/lat`, `category`,
  `severity`, `status`, `address`, `tags`, `created_at`, `city_id`, `city_slug`
  (PII columns `description` + `reporter_id` **excluded**; `status='rejected'` filtered).

So F1 is mostly **repoint 4 functions** in [dashboard-data.ts](../../src/lib/dashboard-data.ts)
from `REPORT_CORPUS` to these RPCs/view, keeping the `DashboardReport`/`CityStats`/
`CategoryCount` shapes so the entire client-side filter/analytics machinery
([filters/derive.ts](../../src/lib/filters/derive.ts), dashboard widgets) works unchanged.

**Three real blockers (need a migration → AGENTS.md rule #10):**
1. **No `reports.source`** → can't exclude synthetic/imported rows from KPIs (the §7
   guardrail). Hard requirement before cold-start writes synthetic into `reports`.
2. **No `cities.center/zoom`** → map center still comes from hardcoded `KNOWN_CITIES`.
3. **View withholds `reporter_id`** (PII) → power-reporter analytics have no source.

---

## 1. Current path (what's wired now)

```
FilterProvider (city layout)  ──loads──▶  getReportCorpus()  ──▶ REPORT_CORPUS (1100 synthetic, DEMO_MODE)
   every analytics/map widget derives client-side from that array (derive.ts)

Server pages ──call──▶ fetchCityStats(cityId)        ┐  all three do `void cityId`
                       fetchCategoryBreakdown(cityId) ├▶ compute over REPORT_CORPUS
                       fetchRecentReports(cityId)     ┘  (ignore the DB entirely)

fetchCity(slug) ── gated by KNOWN_CITIES[slug] (returns null if absent),
                   queries cities table BUT forces boundary=null
```
- `buildCorpus()` returns `[]` when `DEMO_MODE` off ([dashboard-data.ts:399](../../src/lib/dashboard-data.ts#L399))
  → **`DEMO_MODE=0` real deploy = every dashboard blank.** That's blocker B1.
- Corpus center hardcoded `KNOWN_CITIES.cumming.center` ([:405](../../src/lib/dashboard-data.ts#L405)).

---

## 2. Target path (per fetcher)

| Function | Now | Target | Notes |
|---|---|---|---|
| `fetchCityStats(cityId)` | corpus filter | `rpc('city_stats', {_city_id})` | map `open_count→open`, `avg_hours→avg_resolution_hours`. RPC already computes avg via `work_orders.completed_at − reports.created_at`. |
| `fetchCategoryBreakdown(cityId)` | corpus group | `rpc('city_category_breakdown', {_city_id})` | direct shape match |
| `fetchRecentReports(cityId, limit)` | corpus slice | `dashboard_reports_view` `.eq('city_id').order('created_at',desc).limit()` | map `lng/lat → location{lng,lat}` |
| `getReportCorpus()` → `getReportCorpus(cityId)` | full synthetic array | `dashboard_reports_view` `.eq('city_id')` → map rows → `DashboardReport[]` | **signature gains `cityId`** (currently arg-less). FilterProvider must pass it. |
| `fetchCity(slug)` | KNOWN_CITIES gate + boundary=null | DB-first (F2): `cities` by slug incl. `center/zoom/boundary/active` | overlaps **F2** (registry as data). Do together |

**Mapping rule** (view row → `DashboardReport`):
`location = { lng, lat }`, `photo_public_url`, `category`, `severity`, `status`,
`address`, `tags`, `created_at`. **`reporter_id` not in view** → set to a stable
anonymized placeholder OR add an anonymized hash to the view (see §6). `assigned_team`,
`demo`, `ai_reasoning`, `afterPhoto`, `completed_at` stay client-overlay fields (unchanged).

Everything downstream of `DashboardReport[]` (filter context, category chart, map,
recent list, analytics bento, morale) is **untouched**, it operates on the shape, not the source.

---

## 3. The `source` column dependency (the one that gates correctness)

Cold-start (ONBOARDING.md F5) writes synthetic + imported rows into `reports`. Without
a discriminator they pollute real KPIs. Violates ONBOARDING.md §7 ("synthetic must
never mix into real KPIs"). **F1 needs a `source` column** so stats exclude non-resident
data:

```sql
-- candidate (migration 015, pending rule-#10 go)
ALTER TYPE ... ;  -- or text + CHECK
ALTER TABLE reports ADD COLUMN source text NOT NULL DEFAULT 'resident';
-- values: 'resident' | 'synthetic' | 'import' | 'open311' | 'arcgis' | 'csv'
CREATE INDEX idx_reports_city_source ON reports (city_id, source);
```
- `city_stats` / `city_category_breakdown` RPCs + `dashboard_reports_view` get a
  param/filter: **real KPIs count `source='resident'`** (or a real-set); preview
  surfaces show all but **badge synthetic** (UI §3).
- **Until this lands:** do NOT insert synthetic into `reports`. Keep synthetic in the
  existing in-memory `DEMO_MODE` path (§4). This lets F1's *read* rewire ship and be
  tested against real resident rows **before** the migration, decoupling the two.

---

## 4. DEMO_MODE after the rewire (don't delete the synthetic generator)

Two deploys, one codebase:
- **Marketing/demo deploy** (`NEXT_PUBLIC_DEMO_MODE=1`): keep `buildCorpus()`: but
  **parameterize center by the requested city**, not hardcoded `KNOWN_CITIES.cumming`
  ([:405](../../src/lib/dashboard-data.ts#L405)), so the demo works for any slug.
- **Real deploy** (`DEMO_MODE=0`): fetchers read DB. Today this = blank (B1); after
  F1 = real rows.
- **Decision:** `DEMO_MODE` selects the *source* inside each fetcher (corpus vs DB),
  so call sites don't change. Synthetic-in-DB (cold-start, `source='synthetic'`) is a
  separate, later path from synthetic-in-memory (`DEMO_MODE`). Don't conflate them.

---

## 5. Call-site impact (from the full map)

**Safe, import types/metadata only, no behavior change:** all client widgets
(`stats-cards`, `recent-reports`, `category-chart`, `dashboard-interactive`,
`fullscreen-map`, `map-popup`, `filter-bar`, `report-detail`, `delegation-row-expanded`),
and `CATEGORY_META`/`CATEGORY_SLA_TARGETS`/`MUNICIPALITIES` consumers. They take
`DashboardReport[]`/types → unaffected.

**Must update, call the rewired fetchers:**
- `city/[slug]/{page,browse,analytics,map}.tsx`, `city/[slug]/layout.tsx` (getReportCorpus)
- `[team]/[city]/{layout,page,analytics,map}.tsx`
- `staff/{map,stats}.tsx`, `user/map`, `api/ai/reasoning/route.ts`
- **`getReportCorpus()` → `getReportCorpus(cityId)`**: the layouts that seed
  `FilterProvider` must resolve `cityId` (via `fetchCity(slug)`) and pass it. This is
  the one signature change that ripples, every FilterProvider seed site.

**Must update, test:** [dashboard-queries.test.ts](../../src/lib/dashboard-queries.test.ts)
asserts current corpus behavior; rewrite against a seeded test city (or mock the
Supabase client). This is the **exit test** for F1.

**Note:** `listCities` doesn't exist yet. F2 adds it (replaces `MUNICIPALITIES` as
the live-city source). `KNOWN_CITIES` is consumed in ~10 sites purely for center/zoom
+ notFound gating → F2 removes it once `cities.center/zoom` exist (§6).

---

## 6. Schema gaps F1/F2 touch (migration candidates: rule #10)

| Gap | Needed by | Add |
|---|---|---|
| `reports.source` | F1 KPI separation, F5 cold-start | `text NOT NULL DEFAULT 'resident'` + index (§3) |
| `cities.center` + `cities.default_zoom` | kill `KNOWN_CITIES`, map center from DB | `center geography(POINT)`, `default_zoom int` (or derive from boundary bbox at provision) |
| view withholds `reporter_id` | power-reporter analytics | add **anonymized** `reporter_hash` to view (not raw id, keep PII rule), or make those analytics staff-only |
| `cities.parent_id` | §6 tenancy | (already slated for 015) |
| `cities.setup_step` | wizard resume (UI §11) | (already slated for 015) |

These collapse into **one migration `015`** (config + onboarding columns). Flag before writing.

---

## 7. Scale caveat (don't silently cap)

`getReportCorpus` loads the **full** per-city report set client-side (demo = 1100;
derive.ts filters in-browser). A real city could be 10k+ rows → heavy client payload.
- v1: parity with today is fine (demo already ships 1100). 
- Before a high-volume city goes live: cap the corpus to a recent window
  (`created_at > now()-N days` + a count badge) **or** move heavy analytics server-side
  to dedicated metric views (migration 002 already has `metric_reports_by_*`). 
- **Log the cap** if applied (ONBOARDING.md §7 "no silent caps").

---

## 8. Build order + exit test

1. Add the read path behind `DEMO_MODE` branch in the 3 fetchers + `getReportCorpus(cityId)`
   (RPCs/view; no migration needed to *read* real resident rows). 
2. Thread `cityId` into FilterProvider seed sites.
3. Rewrite `dashboard-queries.test.ts` against a seeded city (resident rows).
4. **Exit test (ONBOARDING.md P1):** with `DEMO_MODE=0` and a seeded non-Cumming city,
   `/city/<slug>` renders that city's real stats/categories/recent/map, scoped by
   `city_id`; Cumming's data never leaks in. `pnpm typecheck/lint/test` green.
5. *(after migration 015)* add `source` filter to RPCs/view for synthetic exclusion;
   enable cold-start synthetic-in-DB.

---

## 9. Open decisions

1. **`reporter_id` in public path**: anonymized `reporter_hash` in the view vs make
   power-reporter analytics staff-only. Recommend hash (keeps the public "top reporters"
   widget working without PII).
2. **RPC source-filter shape**: **DECIDED + IMPLEMENTED in migration 015**:
   `city_stats(_city_id, _sources text[] DEFAULT ARRAY['resident'])` (+ same for
   breakdown). Public dashboard uses the default (clean KPIs); the wizard **preview
   passes all sources** so a synthetic-only city still shows a populated dashboard.
3. **`getReportCorpus` server vs client aggregation** at scale (§7). Keep client for
   v1; revisit per-city when a real city crosses ~5k rows.
4. **center/zoom**: store on `cities` vs derive from boundary bbox each render.
   Recommend store at provision (computed once from TIGER `AREALAND`+bbox).
```
