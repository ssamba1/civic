# F5 — Cold-Start Ingest Engine

> Fills a freshly-provisioned city with reports so the dashboard isn't empty —
> the "wow" of onboarding (ONBOARDING.md F5). Adapters → one normalizer → DB writer
> (reports + classifications + work_orders, **no vision for imports**) → optional
> dedup, tracked by a `provision_jobs` row for the wizard StatusBar. Grounded in the
> live pipeline (classify-pipeline.ts, report/actions.ts) read 2026-06-14.

---

## 0. TL;DR

```
adapter (arcgis | synthetic | csv | open311)  →  NormalizedReport[]
   → writer: bulk insert reports(source!) + classifications(mapped, no Gemini)
             + work_orders(generateWorkOrder deterministic [+ batch AI])
   → optional dedup pass
   → provision_jobs row updated throughout  →  Realtime  →  wizard StatusBar
```
**Do NOT route imports through `runClassifyPipeline`** — it downloads a raw photo and
runs Gemini; imports have no photo → everything lands `category:'other', confidence:0`.
Instead F5 writes the classification directly from the source/synthetic category
(§9.4 decision: map, don't re-classify). Vision stays for **new resident** reports only.

---

## 1. NormalizedReport contract

Every adapter emits this; the writer is adapter-agnostic.
```ts
interface NormalizedReport {
  source: 'arcgis' | 'open311' | 'csv' | 'synthetic';
  sourceExternalId?: string;          // upstream id for idempotent re-import
  location: { lng: number; lat: number };   // required (reprojected to 4326)
  category: ReportCategory;           // mapped to Civic taxonomy
  severity: 1|2|3|4|5;                // default 3 if source has none
  status: ReportStatus;               // mapped from source status; synthetic via age
  createdAt: string;                  // ISO; preserves history (not now())
  address?: string;
  photoUrl?: string;                  // rarely present in 311 exports
  raw?: Record<string, unknown>;      // stashed in classifications.raw_response
}
```

---

## 2. Adapters

| Adapter | Source | Mapping notes |
|---|---|---|
| **arcgis.ts** (primary, GA) | Feature Service `/query` (ONBOARDING.md §10) | paginate on `exceededTransferLimit` via `resultOffset`; geometry EPSG:3857→4326; map source `Category_ID`/type field → `ReportCategory` (per-source lookup); `Status`→`ReportStatus`; date field→`createdAt` |
| **synthetic.ts** (universal fallback) | generated | reuse `buildCorpus()` logic from dashboard-data.ts (weighted category/severity, `statusForAge`) but **scatter points inside the real `cities.boundary`** (ST_GeneratePoints / random-in-polygon) not a Cumming bbox; `source:'synthetic'`; **never `is_emergency`** |
| **csv.ts** | operator upload | column-map UI → NormalizedReport; same as arcgis post-map |
| **open311-import.ts** | GeoReport v2 (SeeClickFix/CivicPlus) | inverse of [open311/transform.ts](../../src/lib/open311/transform.ts) (export-only today); `service_code`→category; only where a city is actually on Open311 (sparse) |

Category mapping is per-source (a small lookup table per adapter): e.g. ArcGIS
`"Pothole"|"Street - Pothole"` → `pothole`. Unknown → `other`.

---

## 3. The writer (the careful part)

Per `NormalizedReport`, via `createServerClient()` (service-role, bypasses RLS):

**reports** insert:
```
city_id, source,                          -- source column: migration 015
reporter_id = NULL,                        -- 015 drops NOT NULL (no real reporter)
location = SRID=4326;POINT(lng lat),
photo_public_url = photoUrl ?? categorySeedPhoto(category),  -- NOT NULL → placeholder
photo_raw_url = NULL,
address, status, created_at = createdAt    -- preserve source timestamp
```
- **`reporter_id` NOT NULL gotcha** ([001:93](../../supabase/migrations/20260527_001_initial_schema.sql)): real schema requires it (FK→users→auth.users). Imports have no reporter. **015 makes it nullable**; resident inserts still set it (RLS `reports_insert_resident` unaffected — imports go via service-role).
- **`photo_public_url` NOT NULL**: use the existing category seed images (`photos-public/seed/<category>.jpg`, dashboard-data.ts:391) as placeholder so lists/map render. Synthetic is badged anyway.

**classifications** insert (direct — NO Gemini):
```
report_id, category, severity, subcategory='imported'|'synthetic',
hazard_radius_m=0, visible_size_estimate='unknown', is_emergency=false,
confidence = (source category ? 1.0 : 0), reasoning='Imported from <source>',
model_version='import:<source>', raw_response = raw
```

**work_orders** insert — reuse the deterministic generator (no AI needed at bulk; AI
optional + batched):
```ts
const wo = generateWorkOrder(classification, {isSchoolZone:false, footTrafficWeight:1, recurrenceCount:0});
// insert report_id, department, crew_type, priority_score, est_minutes, materials
// then stamp est_cost + wo_source='rules' (migration 010 cols)
```
For historical/closed imports, also set `work_orders.completed_at` from source close-date
so `city_stats.avg_hours` (resolution time) is real.

---

## 4. Classification & cost strategy (§9.4)

- **Imports:** map source category → taxonomy; deterministic `generateWorkOrder` for
  crew/materials/minutes/cost. Skip vision (no photo). Optional: a **batched** AI
  work-order refine pass post-insert (`generateWorkOrderAI`, Gemini batch ≈
  $0.0011/report) — flag-gated, off for v1 (deterministic is fine for cold-start).
- **Synthetic:** category is generated → same deterministic work-order path.
- **New resident reports (post-launch):** unchanged — full `runClassifyPipeline`
  (vision on the photo). F5 does not touch that path.
- **Never auto-dispatch fake emergencies:** synthetic/import `is_emergency=false`
  always (emergencies auto-set status `dispatched` + skip dedup in the pipeline).

---

## 5. Dedup at bulk scale

The live `find_duplicate_report` RPC (migration 011) is **per-report**. For a bulk
import: run a **post-insert dedup pass** over the batch (or rely on it being off for
v1 cold-start, since a single source rarely self-duplicates). Synthetic scatters points
so it won't dup-flag. Emergencies never deduped (moot — synthetic has none).
Keep `DEDUP_REPORTS` flag semantics; log any merges.

---

## 6. Job tracking → the StatusBar (UI §3)

New `provision_jobs` table (migration 015) is the backing for the wizard's async seam:
```
provision_jobs (id, city_id, status, source, total, ingested, classified, message, created_at, updated_at)
status: 'pending'|'ingesting'|'classifying'|'ready'|'error'
```
- F5 updates `ingested`/`classified`/`status` as it streams → wizard subscribes via
  **Supabase Realtime** (UI §11.3) → StatusBar shows live counts.
- `status='error'` carries `message` → StatusBar `role=alert` + Retry / Continue-partial.
- `source` lets the bar say "No ArcGIS source — filled 200 synthetic" (honest degraded
  state, UI §3).

---

## 7. Privacy

- Imports rarely carry photos. **If a source photo exists**, it must go through the
  blur/raw-bucket path (AGENTS.md #2) — never straight to `photos-public`. v1: if a
  source provides a public photo URL, store the URL but flag for review; do NOT
  auto-republish unblurred third-party media. Default = category placeholder.
- Synthetic photos = the CC-licensed category seed images (already public, safe).

---

## 8. Source labeling guarantee (no KPI pollution)

- `reports.source` (015) + `city_stats`/`city_category_breakdown` take
  `_sources text[] DEFAULT ARRAY['resident']` → public KPIs count resident only;
  **synthetic/import never inflate real metrics** (ONBOARDING.md §7). The wizard
  **preview passes all sources** so a synthetic-only city looks alive (the demo).
- `dashboard_reports_view` **exposes** `source` → UI badges synthetic "Demo data"
  (preview shows everything; metrics count only real). Hard wall, per §7.

---

## 9. Build stages & exit test

- **Needs migration 015** (source, nullable reporter_id, provision_jobs).
- **Stage 1 (demo win):** `synthetic.ts` + writer + provision_jobs → provision a city,
  watch it fill. Exit: `/city/<slug>` preview shows N synthetic reports, badged, KPIs
  exclude them; StatusBar streams counts.
- **Stage 2 (real data):** `arcgis.ts` adapter against a live Feature Service (the
  280k-record endpoint from §10) → real reports, deduped, reprojected. Exit: a GA
  city's real 311 layer lands in the dashboard.
- **Stage 3:** csv + open311 adapters.
- `pnpm typecheck/lint/test` green; new adapter + normalizer unit tests.

---

## 10. Open decisions

1. **Synthetic point distribution** — random-in-polygon (`ST_GeneratePoints`) vs snap
   to OSM road network. Recommend random-in-polygon v1 (no OSM dependency); road-snap
   later for realism.
2. **Batch AI work-order refine** on import — on/off default. Recommend off v1
   (deterministic est_cost is enough; saves the per-record AI even though it's cheap).
3. **Re-import idempotency** — dedupe on `sourceExternalId` (needs a column or a
   `classifications.raw_response` lookup). Recommend a `reports.source_external_id`
   text + unique(city_id, source, source_external_id) — add to 015 **if** re-import
   matters for v1; else skip.
4. **completed_at backfill** from import close-dates — yes (makes resolution-time KPI
   real), but only when the source exposes a close timestamp.
