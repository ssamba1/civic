# Camera → Liability → Claim Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/planning/CAMERA_LIABILITY_PIPELINE.md` — liability attribution on reports (Phase A), staff-approved claim packets (Phase C), camera ingest with detection clustering (Phase B).

**Architecture:** Three additive SQL migrations (062/063/064, written NOT applied — user applies), a pure-function liability engine wired in after classification, claim assembly reusing the notify outbox, and a camera ingest tier whose detector runs in a Python sidecar scaffold. All new tables RLS default-deny. Per-city tunables are TS constants in `lib/liability/config.ts` v1 (no `city_settings` table — YAGNI until a second city needs different numbers).

**Tech Stack:** Next.js 16 App Router, Supabase Postgres 15 + PostGIS, TypeScript strict, Vitest co-located tests, existing `Result<T>` tagged-union convention. No new pnpm dependencies. Detector sidecar = FastAPI + ONNX Runtime scaffold only (no model shipped; licensing note in spec §4.3).

**Ground rules for every worker (from agents.md + session memories):**
- Do NOT run `git commit` — orchestrator commits explicit paths (parallel-session race guard).
- Do NOT apply migrations — write SQL only; user applies (`apply-pending-and-backfill-ledger.mjs` flow).
- `pnpm typecheck` is the real gate; repo-wide `pnpm lint` has a ~325-error pre-existing red baseline — lint only touched files (`npx biome check <files>`).
- Errors: `{ ok: true, data } | { ok: false, error }`. No `any` without a why-comment. Time = `timestamptz`, geo = `geography(...,4326)`, geo queries = PostGIS not app math.
- After Write, grep-verify content is on disk (IDE buffer revert gotcha).

---

## Shared contract — `src/lib/liability/types.ts` (Task L1 creates it; ALL workers code against these exact shapes)

```ts
export type LiabilityVerdict =
  | "contractor_warranty"
  | "utility_restoration"
  | "city_cost"
  | "unknown";

export interface LiabilityEvaluation {
  verdict: LiabilityVerdict;
  capitalJobId: string | null;
  warrantyId: string | null;
  utilityPermitId: string | null;
  liableContractorId: string | null;
  windowEndsOn: string | null; // ISO date
  matchDistanceM: number | null;
  confidence: number; // 0..1
}

export interface CapitalJobRow {
  id: string;
  contractor_id: string | null;
  contract_ref: string | null;
  job_type: "resurfacing" | "sidewalk" | "signal" | "streetlight" | "other";
  completed_at: string; // date
  source: "manual" | "csv" | "arcgis";
  distance_m: number; // computed by the candidate query
}

export interface WarrantyRow {
  id: string;
  capital_job_id: string;
  warranty_type: "workmanship" | "pavement_performance" | "manufacturer" | "maintenance_bond";
  starts_on: string;
  ends_on: string;
  covers_categories: string[] | null;
}

export interface UtilityPermitRow {
  id: string;
  permittee_name: string;
  permittee_contractor_id: string | null;
  permit_ref: string | null;
  liability_ends_on: string | null;
  distance_m: number;
}

export interface ClaimPacket {
  reportId: string;
  basis: "warranty" | "utility_restoration";
  defect: {
    category: string;
    severity: number | null;
    hazardSeverity: string | null;
    address: string | null;
    lng: number;
    lat: number;
    photoUrls: string[];
    observedAt: string;
    observationCount: number; // 1 for resident reports; cluster count for camera
  };
  liability: {
    contractorId: string | null;
    contractorName: string | null;
    contractRef: string | null;
    permitRef: string | null;
    jobCompletedAt: string | null;
    warrantyType: string | null;
    windowEndsOn: string | null;
    matchDistanceM: number | null;
    confidence: number;
  };
  requestedAction: string;
  generatedAt: string;
}
```

`src/lib/liability/config.ts`:

```ts
/** Spatial tolerance for footprint matching. A road centerline is not the pothole. */
export const MATCH_TOLERANCE_M = 15;
/** Camera detection clustering radius — GPS error on a moving vehicle. */
export const CLUSTER_RADIUS_M = 8;
/** Promote a cluster to a report after N passes on >= MIN_DISTINCT_DAYS days. */
export const PROMOTE_MIN_PASSES = 3;
export const PROMOTE_MIN_DISTINCT_DAYS = 2;
/** Category → compatible capital job types (zero-score any other pairing). */
export const CATEGORY_JOB_COMPAT: Record<string, string[]> = {
  pothole: ["resurfacing"],
  sidewalk_damage: ["sidewalk"],
  streetlight: ["streetlight"],
  faded_signage: ["other"],
  drainage: ["resurfacing", "other"],
};
```

---

## Worker M — Migrations + RLS tests

**Files:**
- Create: `supabase/migrations/20260823_062_liability.sql`
- Create: `supabase/migrations/20260823_063_claims.sql`
- Create: `supabase/migrations/20260823_064_camera.sql`
- Create: `tests/rls/liability.rls.test.ts`
- Create: `tests/rls/camera.rls.test.ts`

- [ ] **M1: 062_liability.sql** — DDL from spec §3.1 verbatim (capital_jobs, warranties, utility_permits, report_liability), plus:
  - re-issue `reports_source_check` drop/add with `'camera'` added to the six existing values (copy the drop-then-add idiom from 024:39-42)
  - GIST index on `capital_jobs.footprint` and `utility_permits.trench`; btree `idx_report_liability_sweep ON report_liability (window_ends_on) WHERE verdict <> 'city_cost'`; btree `capital_jobs (city_id, completed_at)`
  - RLS: enable on all four; staff SELECT via `is_staff() AND city_id = current_user_city_id()` (report_liability scopes through its report's city — use an EXISTS subquery on reports); admin-only INSERT/UPDATE/DELETE via `is_admin()` (from 053). NO contractor policies on any of these (contractors must not read capital_jobs/claims data).
  - Idempotent style: `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before each `CREATE POLICY`, wrapped in `BEGIN;/COMMIT;` (053 is the style reference).
- [ ] **M2: 063_claims.sql** — `claims` table from spec §5.2 verbatim + `idx_claims_queue ON claims (city_id, state)`. RLS: staff SELECT own-city; admin INSERT/UPDATE; contractor SELECT **only** rows where `liable_contractor_id = current_contractor_id()` AND `state IN ('sent','accepted','declined','disputed','resolved')` (drafts invisible to contractors).
- [ ] **M3: 064_camera.sql** — `camera_devices`, `detections`, `detection_clusters` from spec §4.2/§4.4 verbatim. GIST on `detections.location` and `detection_clusters.centroid`; btree `detection_clusters (city_id, state)`. RLS: staff SELECT own-city, admin write, service-role-only ingest (no anon/authenticated INSERT policy at all — ingest goes through the API-key server route with service client).
- [ ] **M4: RLS tests** — follow the `skipIf` + `SUPABASE_TEST_*` env-gate pattern in `tests/rls/crews.rls.test.ts` (read it first). Assert: anon default-deny on all 8 new tables; contractor key cannot SELECT capital_jobs or draft claims; service-role bypass control passes.
- [ ] **M5: Verify** — `npx tsx -e "require('fs')"` no-op not needed; instead run `pnpm test -- tests/rls` (suites skip green without env) and paste SQL through `node -e` length check. Grep-verify all 5 files on disk.

## Worker L — Liability engine (Phase A core)

**Files:**
- Create: `src/lib/liability/types.ts`, `config.ts` (contracts above, verbatim)
- Create: `src/lib/liability/evaluate.ts` + `evaluate.test.ts`
- Create: `src/lib/liability/db.ts` (candidate queries)
- Create: `src/lib/liability/sweep.ts` + `sweep.test.ts`
- Modify: `src/app/report/actions.ts` (two call sites — after both `runClassifyPipeline(reportId)` calls, lines ~346 and ~396)

- [ ] **L1: types + config** verbatim from contract section.
- [ ] **L2 (TDD): `pickVerdict(jobs, warranties, permits, report)` pure function** in evaluate.ts. Test cases FIRST (evaluate.test.ts): utility beats warranty when both in window; nearest job wins within type, tie → lower distance then most recent completed_at; expired warranty → no match; `covers_categories` filter respected; empty source data → `unknown` NOT `city_cost`; populated sources with no hit → `city_cost`; confidence = clamp(0..1) of `0.5*distanceScore + 0.3*compatScore + 0.2*sourceScore` where distanceScore = 1 - distance_m/MATCH_TOLERANCE_M, compatScore = 1 if category in CATEGORY_JOB_COMPAT[job_type] else 0, sourceScore = arcgis 1.0 / csv 0.7 / manual 0.5. Run `npx vitest run src/lib/liability` red → implement → green.
- [ ] **L3: `db.ts` candidate queries** — service client, `ST_DWithin` on geography with `MATCH_TOLERANCE_M`, `ST_Distance` as `distance_m`, date filters per spec §3.2. Use `.rpc` or raw `sql` matching house pattern in `src/lib/db/` (read `src/lib/db/districts.ts` for the idiom).
- [ ] **L4: `evaluateReportLiability(reportId): Promise<Result<LiabilityEvaluation>>`** — fetch report (location/category/created_at/city_id) → candidates → `pickVerdict` → UPSERT `report_liability`. Distinguish "tables empty for city" (→ unknown) from "no rows within tolerance" (→ city_cost): one cheap `SELECT EXISTS` per source table per city.
- [ ] **L5: hook into `report/actions.ts`** — after each `runClassifyPipeline(reportId)` resolves, fire-and-forget `evaluateReportLiability(reportId).catch(...)` with the same best-effort logging style as the surrounding code (read the surrounding `after()`/catch idiom first; never block or fail report submission on liability).
- [ ] **L6: `sweep.ts`** — `fetchExpiringWarranties(cityId, horizonDays)`: capital jobs with warranties ending within horizon + count of open reports whose `report_liability.capital_job_id` matches. Pure SQL, test the row-shaping function with fixtures.
- [ ] **L7: Verify** — `pnpm typecheck` clean; `npx vitest run src/lib/liability` green; `npx biome check src/lib/liability src/app/report/actions.ts` no NEW errors.

## Worker P — Claims (Phase C)

**Files:**
- Create: `src/lib/liability/packet.ts` + `packet.test.ts`
- Create: `src/lib/liability/claims-actions.ts` (server actions)

- [ ] **P1 (TDD): `assemblePacket(input): ClaimPacket`** pure function — input = report row + classification + liability row + contractor name + photo URLs + optional cluster observation stats. Snapshot-shape test: stable field order, `observationCount` defaults 1, camera reports include observation history line in `requestedAction`. Red → implement → green.
- [ ] **P2: `claims-actions.ts`** server actions (`"use server"`, staff-gated via the `getStaffUser` idiom from `src/app/staff/actions.ts`):
  - `createDraftClaim(reportId)` → assembles packet, inserts `claims` row state `'draft'`, `packet` jsonb snapshot.
  - `approveClaims(claimIds[])` → batch: state `'sent'`, `sent_at=now()`, sets `work_orders.contractor_id` + `contractor_status='assigned'` on each report's WO, delivers ONE batched email per contractor via `deliverEmail` (`src/lib/notify/deliver.ts:87`) listing all claims; record outcome per the outbox stamping idiom (read `src/lib/notify/outbox.ts` header comment first).
  - `dismissClaim(claimId, reason)`, `resolveClaim(claimId, recoveredCents)`.
  - Every action returns `Result<...>`; every state transition validated (draft→sent only from draft, etc. — test the transition guard as a pure function).
- [ ] **P3: Verify** — typecheck + `npx vitest run src/lib/liability/packet.test.ts` + biome on touched files.

## Worker K — Camera ingest (Phase B, in-repo parts)

**Files:**
- Create: `src/lib/camera/cluster.ts` + `cluster.test.ts`
- Create: `src/lib/camera/ingest.ts`
- Create: `src/app/api/camera/frames/route.ts`
- Create: `src/lib/privacy/blur-server.ts` (NEW file — client blur path untouched)
- Create: `services/detector/README.md`, `services/detector/app.py`, `services/detector/requirements.txt`, `services/detector/contract.md`

- [ ] **K1 (TDD): `assignCluster(detection, nearbyClusters)` + `shouldPromote(cluster, detections)`** pure functions per spec §4.4 — same damage_class + within `CLUSTER_RADIUS_M` + cluster not resolved → join, else new cluster; promote when ≥ `PROMOTE_MIN_PASSES` detections spanning ≥ `PROMOTE_MIN_DISTINCT_DAYS` distinct UTC dates. Tests first (incl. the 20-passes-one-day negative and resolved-cluster-reopens-new case).
- [ ] **K2: `/api/camera/frames` route** — POST, auth via `api_keys` (read `src/app/api/open311/v2` route for the key-hash verification idiom; require scope `'camera:ingest'`), zod-validate `FrameBatch` (spec §4.2), idempotent on `(deviceId, frame.externalId)`. Pipeline per frame: call detector sidecar `POST {DETECTOR_URL}/detect` → below-threshold frames dropped entirely → surviving crops through `blurServerSide()` → blurred crop to `photos-public` under `camera/<deviceId>/` → `detections` insert → clustering (K1) → promotion inserts a report (`source='camera'`, `source_external_id=cluster.id`, `reporter_id=null`, photo = best crop) then `runClassifyPipeline(reportId)` — mirror the F5 writer semantics; camera reports must never set `is_emergency` auto-dispatch.
- [ ] **K3: `blur-server.ts`** — `blurServerSide(imageBytes): Promise<Result<Uint8Array>>` calling sidecar `POST {DETECTOR_URL}/blur`. **On ANY failure return `{ok:false}` and the caller DROPS the crop — an unblurred byte must never be persisted anywhere. No fallback. Write this rule as the file's header comment.**
- [ ] **K4: sidecar scaffold** — FastAPI `app.py` with `/detect` (stub returning `[]` + TODO) and `/blur` (stub 501), `requirements.txt` (fastapi, uvicorn, onnxruntime, pillow — pinned), `contract.md` documenting both endpoints' request/response JSON, `README.md` stating: RDD2022-trained Apache-licensed detector to be selected at deploy time; AGPL Ultralytics checkpoints excluded (spec §4.3); env `DETECTOR_URL` consumed by the Next app.
- [ ] **K5: Verify** — typecheck, `npx vitest run src/lib/camera`, biome touched files. Route must degrade: sidecar unreachable → 503 with retryable error, never a crash.

## Worker U — UI surfaces

**Files:**
- Create: `src/components/liability/liability-badge.tsx`
- Create: `src/app/admin/liability/page.tsx` + `actions.ts` (sweep + CSV import)
- Create: `src/app/admin/claims/page.tsx` + `actions.ts` (review queue)
- Modify: mount badge in the staff report-detail surface (locate it: `grep -rn "hazard_severity\|hazardSeverity" src/components src/app --include=*.tsx` and mount alongside the hazard badge)

- [ ] **U1: `liability-badge.tsx`** — server component; props = `LiabilityEvaluation` + contractor name. Renders per spec §3.4: verdict, contract ref, days remaining, `match_distance_m`, confidence %. `unknown` renders "No contract data — add paving schedule" muted state, NEVER as city-cost. Use existing token classes only (grayscale enterprise reskin — no hardcoded colors; copy badge idiom from an existing staff badge component).
- [ ] **U2: `/admin/claims`** — queue table (AG Grid if the admin pages use it — read `src/app/admin/contractors/page.tsx` first and copy its layout/auth pattern), filters by state, multi-select → `approveClaims` batch, per-row dismiss with reason. Confirmation dialog before send (irreversible outward action) listing recipient + claim count.
- [ ] **U3: `/admin/liability`** — expiry sweep list (60/30/7 chips calling `fetchExpiringWarranties`), recovery ledger totals from `claims` (sent/accepted/recovered ¢ — reuse `src/lib/currency.ts`), CSV import for capital_jobs + utility_permits reusing the column-mapping approach of `src/app/admin/import` (read it first; footprint v1 = paste WKT LINESTRING or lat/lng pairs textarea → build LINESTRING; document EPSG:4326 assumption inline).
- [ ] **U4: Verify** — typecheck, biome touched, `pnpm dev` boots and `/admin/liability` + `/admin/claims` render without runtime error (empty states OK).

---

## Execution order

```
Wave 0 (orchestrator): commit spec + this plan.
Wave 1 (parallel): M, L, P, K, U — file sets are disjoint; all TS coded against the
  shared contract section verbatim. U reads L's action signatures FROM THIS PLAN,
  not from disk.
Wave 2 (orchestrator): pnpm typecheck + pnpm test (unit) + biome on the union of
  touched files; fix integration seams; commit explicit paths; report.
NOT in scope this session: applying migrations (user), detector model selection,
  fleet hardware, Open311 XML changes (camera reports ride existing export).
```

## Self-review notes (spec coverage)

- Spec §3 → M1, L1-L7, U1, U3. §4 → M3, K1-K5. §5 → M2, P1-P3, U2. §6 error table → embedded per-task (blur-drop rule K3, unknown-vs-city_cost L4, sidecar-503 K5). §7 → M4 + co-located unit tests per task. §8 open decisions: tunables = TS constants (documented top); precedence default = utility-first (L2 test locks it).
- Deliberately deferred: `is_stale` nightly re-evaluation job (needs cron infra decision), contractor scorecard analytics RPC, ArcGIS capital-jobs adapter, street-segment resolver — all flagged in spec, none block A/C/B v1.
