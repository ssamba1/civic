# F4 — `provisionCity()` Provisioning Engine

> The function Step 1 of the wizard drives and F5 ingests into. Turns
> `{ name, state }` into a `cities` row with a real TIGER boundary + center +
> config template, idempotently. Grounded in code + schema read 2026-06-14.
> No code written yet; migration columns flagged per AGENTS.md rule #10.

---

## 0. TL;DR

```
resolveCityCandidates({name, state})   → TIGER multi-layer search (no geometry)  → candidate[]
   (wizard Step 2 picks one if >1)
provisionCity({candidate | name+state}) → fetch geometry → insert cities (active=FALSE,
                                          service-role) → apply config template → Result
```
Idempotent on `cities.slug` (re-provision updates, never duplicates). Uses
`createServerClient()` (service-role, **bypasses RLS** — required: `cities` has no
insert policy). All TIGER mechanics verified live (ONBOARDING.md §10).

---

## 1. Contracts

```ts
// src/lib/onboarding/provision-city.ts
interface CityCandidate {
  name: string;          // raw TIGER NAME, e.g. "Cumming city", "Chatham County"
  displayName: string;   // cleaned, e.g. "Cumming" / "Chatham County"
  type: 'place' | 'consolidated' | 'county' | 'cdp';
  geoid: string;         // TIGER GEOID (5 or 7 digit)
  layerUrl: string;      // which TIGER layer/endpoint to fetch geometry from
  state: string;         // 'GA'
  stateFips: string;     // '13'
  areaLandM2: number;    // AREALAND → default zoom + §6 smallest-area containment
  center: { lng: number; lat: number }; // INTPTLON/INTPTLAT
}

function resolveCityCandidates(input: { name: string; state: string })
  : Promise<Result<CityCandidate[]>>;

function provisionCity(input:
  { candidate: CityCandidate } | { name: string; state: string })
  : Promise<Result<{ cityId: string; slug: string; created: boolean }>>;
```
`Result<T>` = the existing repo pattern (`{ ok: true, value } | { ok: false, error }`,
see report/actions.ts). `created` distinguishes insert vs idempotent update.

---

## 2. Algorithm

1. **Normalize.** `stateFips = STATE_FIPS[state]` (static 50-state map; GA=13).
   `slug = slugify(displayName)` (`cumming`, `athens-clarke-county`).
2. **Resolve (multi-layer, no geometry — fast).** Query each TIGER layer with
   `returnGeometry=false`, `outFields=NAME,GEOID,INTPTLAT,INTPTLON,AREALAND`,
   `where=UPPER(NAME) LIKE '<UPPER name>%' AND STATE='<fips>'`:
   - Incorporated Places — `Places_CouSub_ConCity_SubMCD/MapServer/4` → `type:'place'`
   - Consolidated Cities — `.../MapServer/3` → `type:'consolidated'`
   - CDPs — `.../MapServer/5` → `type:'cdp'`
   - Counties — `State_County/MapServer/1` → `type:'county'`
   Merge results → `CityCandidate[]`. (Name-format mess is why this is multi-layer —
   ONBOARDING.md §10 Finding 4.)
3. **Pick.** 1 candidate → auto. >1 → wizard Step 2 disambiguates (radio + map).
   0 → error `NO_MATCH` (manual lat/lng fallback, UI §4 "None of these").
4. **Fetch geometry** for the chosen GEOID only:
   `<layerUrl>/query?where=GEOID='<geoid>'&returnGeometry=true&outSR=4326&f=geojson`
   → RFC-7946 GeoJSON (see §3). `outSR=4326` forces WGS84 (no reprojection).
5. **Insert/upsert** `cities` (service-role), `active=false`:
   ```sql
   INSERT INTO cities (slug, name, state, boundary, center, default_zoom,
                       open311_jurisdiction_id, active)
   VALUES ($slug,$name,$state, ST_GeomFromGeoJSON($geojson)::geography,
           ST_SetSRID(ST_MakePoint($lng,$lat),4326)::geography, $zoom, $j, false)
   ON CONFLICT (slug) DO UPDATE
     SET boundary=EXCLUDED.boundary, center=EXCLUDED.center,
         default_zoom=EXCLUDED.default_zoom
   RETURNING id, (xmax = 0) AS created;
   ```
   (`center`/`default_zoom` columns need migration 015 — §6; without them, store
   boundary only and derive center via `ST_Centroid` at render.)
6. **Apply config template** (gated on 015 F3 tables — §5). If tables absent, skip;
   app falls back to teams.ts statics (today's behavior). Idempotent per city.
7. **Return** `{ cityId, slug, created }`.

`default_zoom` from `areaLandM2`: small place → 13, town → 12, county → 10
(log-scale on √area). Cheap heuristic; fine-tune later.

---

## 3. Geometry transform (the gotcha)

- **Primary: `f=geojson`.** TIGERweb (ArcGIS Server ≥10.4) returns RFC-7946 GeoJSON
  directly → `ST_GeomFromGeoJSON()` with no winding fix. Verify support per service;
  Cumming geometry call already returned valid rings.
- **Fallback: esri rings** (`f=json`). Esri winding is **opposite** of GeoJSON
  (esri exterior=CW, holes=CCW; GeoJSON exterior=CCW). And esri lumps all rings in one
  `rings[]` → must group outer+holes by orientation to rebuild polygons. Avoid by using
  `f=geojson`; if forced, `ST_MakeValid(ST_ForcePolygonCCW(...))`.
- **MULTIPOLYGON problem (schema):** `cities.boundary` is `geography(POLYGON,4326)`
  ([001:72](../../supabase/migrations/20260527_001_initial_schema.sql#L72)). Real
  boundaries are often multipolygon (exclaves, annexed parcels, islands). A multipolygon
  GeoJSON **won't insert into a POLYGON column.** Fix in 015:
  `ALTER TABLE cities ALTER COLUMN boundary TYPE geography(MULTIPOLYGON,4326)
  USING ST_Multi(boundary::geometry)::geography`, and always `ST_Multi()` on insert.
  **Without this, F4 breaks for any multipart city.** High-priority correctness item.
- Validate: `ST_IsValid` / `ST_MakeValid`; reject empty geometry.

---

## 4. TIGER reference (verified)

| Type | Endpoint | NAME example | GEOID |
|---|---|---|---|
| Place | `Places_CouSub_ConCity_SubMCD/MapServer/4` | `Cumming city` | 7-digit |
| Consolidated | `.../MapServer/3` | `Athens-Clarke County unified government` | 7-digit |
| CDP | `.../MapServer/5` | `… CDP` | 7-digit |
| County | `State_County/MapServer/1` | `Chatham County` | 5-digit |

Host `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/`. Fields:
`NAME, GEOID, STATE, INTPTLAT, INTPTLON, AREALAND`. `STATE` = 2-digit FIPS string.
Free, no key, authoritative for US. OSM Nominatim = non-US / non-incorporated fallback.

---

## 5. Config template applier (gated on migration 015 / F3)

Seeds per-city config from [teams.ts](../../src/lib/teams.ts) `TEAMS` (11 real
departments + their `categories`) so a new city inherits a working, overridable setup:

| Target table (015) | Source |
|---|---|
| `city_departments` | each `TEAMS[id]`: label, shortLabel, color, icon, active=true |
| `category_routing` | invert `TEAMS[id].categories` → `(category → team_id)` (= `categoryToTeamDefault`) |
| `sla_targets` | `CATEGORY_SLA_TARGETS` (dashboard-data.ts) per category |
| `cost_rules` | seed from existing work-order cost defaults (work-order-rules/ai) |

Applier is idempotent (`ON CONFLICT (city_id, …) DO NOTHING`). Until 015 exists,
**skip** — the app already reads teams.ts/CATEGORY_SLA_TARGETS statically, so a new
city silently inherits identical config (acceptable for P0/MVP; customization needs 015).

---

## 6. Schema interactions + gaps

| Item | State | Action |
|---|---|---|
| `cities.active` defaults **true** ([001:74](../../supabase/migrations/20260527_001_initial_schema.sql#L74)) | wrong for onboarding | provisionCity **explicitly sets `active=false`**; go-live flips it |
| `cities.boundary` = POLYGON | breaks on multipart cities | ALTER → MULTIPOLYGON (015) + `ST_Multi()` (§3) |
| `cities.center`, `default_zoom` | absent | add (015); else derive center via `ST_Centroid` at render |
| `cities.parent_id`, `setup_step` | absent | add (015) — §6 tenancy, UI resume |
| `reports.source` | absent | add (015) — F1/F5 |
| `cities` insert/update RLS | **none** (only `cities_select USING(true)`) | provisionCity uses service-role client → bypasses RLS, OK. **No public/anon write path** (good — provisioning is operator-only) |
| `current_user_city_id()`, `is_staff()` | exist | per-city config RLS (015 tables) mirrors these |

---

## 7. Security

- **Service-role only.** `provisionCity` runs in a server action / background job via
  `createServerClient()` ([db/client.ts](../../src/lib/db/client.ts)) — never importable
  client-side. It bypasses RLS by design (provisioning writes `cities`, which has no
  write policy).
- **Gate the caller.** The `/admin/onboard` server action must check the operator is
  `admin` (+ allowlist) before calling provisionCity (UI §11 decision 5). The function
  itself trusts its caller (elevated context) — auth lives at the route boundary.
- **Input validation** (zod): `name` non-empty ≤100, `state` ∈ 50-state enum. TIGER
  `where` uses parameterized/escaped input (avoid injection into the ArcGIS query string).
- No PII, no photos in provisioning → privacy rules (AGENTS.md #2) not triggered here;
  they apply to F5 ingest media.

---

## 8. Idempotency & error modes

| Case | Behavior |
|---|---|
| Re-provision same slug | `ON CONFLICT (slug) DO UPDATE` → returns existing `cityId`, `created:false` |
| 0 TIGER matches | `Result.error = NO_MATCH` → UI manual lat/lng fallback |
| >1 matches | return all candidates → Step 2 picks (not an error) |
| Multipolygon into POLYGON col | hard fail until 015 ALTER (§3) — flagged |
| Geometry fetch fails / empty | `Result.error = GEOMETRY_FETCH` → retry button |
| TIGER timeout | retry w/ backoff; surface in status bar |
| Slug collision, different city | append state/county suffix (`cumming-ga`) — decision §10 |

---

## 9. Dependencies & build stages

- **Stage A (today's schema, partial):** `resolveCityCandidates` + insert `cities`
  (boundary single-polygon only, `active=false`). Works now, but the row **won't
  render** until F2 removes the `KNOWN_CITIES` gate + `dynamicParams`. So Stage A is
  only useful paired with F2.
- **Stage B (after migration 015):** MULTIPOLYGON, `center`/`default_zoom`,
  `parent_id`, `source`, + config template applier. This is the complete F4.
- **Order:** migration 015 → F4 Stage B + F2 + F1 read-rewire = the P0 backend. F5
  ingest fills the city F4 created.

---

## 10. Open decisions

1. **Slug collisions across states** (two "Springfield") — suffix with state
   (`springfield-il`) always, or only on collision? Recommend suffix-on-collision,
   keep clean slugs for the common case.
2. **County tenants** — provision the county as its own `cities` row (Macon-Bibb,
   Chatham) vs only cities. Recommend allow both; consolidated govs are single-tenant
   (no parent_id), separate cities get `parent_id → county` (§6).
3. **`f=geojson` support** across all 4 TIGER layers — verify; if any layer lacks it,
   implement the esri-rings fallback (§3) for that layer only.
4. **Open311 jurisdiction id** — auto-derive vs operator-entered. Recommend optional
   operator field (Step 1), null default.
5. **default_zoom heuristic** — √area log-scale vs fit-bounds on client. Recommend
   store a heuristic seed, let the map `fitBounds(boundary)` on first load anyway.
```
