# Camera → Detection → Liability → Claim Pipeline

> Design spec. Date: 2026-08-23. Status: **awaiting user review, no code written.**
>
> Extends the existing report pipeline with (A) contractor/warranty liability
> attribution, (B) vehicle-mounted camera ingest with a local detector gate, and
> (C) a staff-approved contractor claim packet.
>
> Grounded in a read of the live tree on 2026-08-23: `053_contractors.sql`,
> `024_city_config.sql`, `028_api_keys.sql`, `src/lib/ai/classify-pipeline.ts`,
> `docs/planning/F5_INGEST.md`, `docs/planning/fcamera-ai-pipeline-plan.md`.

---

## 0. TL;DR

```
bus/fleet dashcam  →  frame batch upload (depot wifi, API key)
   →  detector gate (Apache-licensed, RDD2022-trained; ~95% frames dropped here)
   →  detection clustering (same pothole seen 20x/day collapses to 1)
   →  server-side blur (faces + plates)  →  photos-public
   →  Gemini classify (survivors only)   →  report + work_order
   →  LIABILITY JOIN: capital_jobs ∩ warranties ∩ utility_permits (PostGIS)
   →  claim packet assembled  →  staff review queue  →  send to contractor
```

The commercial argument is not detection. It is **liability attribution**:
answering "is this defect somebody else's financial problem, and is the warranty
clock still running?" at the moment the defect is created, before a crew patches
it and destroys the evidence.

---

## 1. Why this is three subsystems, not one

Each ships independently and each is independently demoable. Build in order.

| Phase | What | Depends on | Value if shipped alone |
|---|---|---|---|
| **A, Liability attribution** | `capital_jobs`, `warranties`, `utility_permits`, spatial join at report intake, warranty badge on every report, expiry sweep | nothing new, runs on today's resident reports | **High.** Dollar-recovery story with zero hardware. De-risks B by proving the join works before anyone buys a camera. |
| **B, Camera ingest** | frame API, detector gate, detection clustering, server-side blur worker, camera→report writer | A (so detections get liability badges) | Medium alone, volume without attribution is just more tickets. |
| **C, Claim packet** | packet assembly, staff review queue, contractor delivery, recovery ledger | A (needs liability), C is better with B (needs evidence chain) | High, converts A's finding into recovered money. |

**Recommendation: A → C → B.** A and C together are the complete money story on
existing report volume. B multiplies it. This ordering is deliberately different
from the naive camera-first read of the idea.

---

## 2. What already exists: reuse, do not rebuild

| Need | Existing asset | Notes |
|---|---|---|
| External vendor identity + auth | `contractors` table, `current_contractor_id()`, contractor portal RLS (053) | Claim recipient already modeled. `work_orders.contractor_id` FK exists. |
| Contractor work lifecycle | `work_orders.contractor_status` (`assigned\|accepted\|declined\|in_progress\|complete`) (053) | Claim response states map onto this. |
| Non-resident report writer | `F5_INGEST.md` `NormalizedReport` contract + writer | Camera adapter is a fourth adapter shape, not a new pipeline. |
| Source labeling / KPI isolation | `reports.source` + `reports_source_check` + `_sources text[]` on stats RPCs (024) | Camera detections **must not** inflate resident-report KPIs. Add `'camera'` to the CHECK constraint. |
| Idempotent re-ingest | `reports.source_external_id` + `uq_reports_source_external` (024) | Frame/detection id becomes the external id. Free replay safety. |
| External caller auth | `api_keys` (key_hash, scopes, city_id) (028) | Add scope `camera:ingest`. Fleet uploader authenticates with an API key, not a user session. |
| Vision + structured output + retry + rate limit | `src/lib/ai/gemini.ts`, `classify-pipeline.ts`, `retry.ts`, `rate-limit.ts`, `config.ts` | LLM stage is done. Camera path calls it with a crop instead of a phone photo. |
| Spatial primitives | PostGIS, `ST_DWithin`, `find_duplicate_report` RPC, `023b_photo_phash` | Liability join and detection clustering both build on this. |
| Delivery | `src/lib/notify/outbox.ts`, `deliver.ts`, `webhook_endpoints` (047) | Claim delivery reuses the outbox, does not invent a mailer. |
| Work-order generation | `work-order-rules.ts`, `work-order-ai.ts`, `effort_priors` (061) | Unchanged. Camera detections produce work orders the same way. |

Roughly 70% of the plumbing is in place. The genuinely new surfaces are: three
attribution tables, the detector gate, detection clustering, a server-side blur
worker, and the claim packet.

---

## 3. Phase A: Liability attribution

### 3.1 Data model (migration `20260823_062_liability.sql`)

All new tables: RLS enabled, default deny, staff-read / admin-write, city-scoped.
All geometry `geography(…, 4326)`. All time `timestamptz`.

```sql
-- A capital job: a contracted piece of work with a footprint and a completion date.
capital_jobs (
  id uuid pk,
  city_id uuid not null references cities,
  contractor_id uuid references contractors,      -- nullable: legacy jobs w/o vendor row
  contract_ref text,                              -- city's contract/PO number
  job_type text not null,                         -- 'resurfacing'|'sidewalk'|'signal'|'streetlight'|'other'
  description text,
  footprint geography(GEOMETRY, 4326) not null,   -- LINESTRING for a street segment, POLYGON for an area
  completed_at date not null,                     -- substantial completion. Warranty clock starts here
  contract_value_cents bigint,
  source text not null default 'manual',          -- 'manual'|'csv'|'arcgis'
  source_external_id text,
  created_at timestamptz not null default now()
)

-- A warranty attached to a capital job (a job may carry several: workmanship + product).
warranties (
  id uuid pk,
  capital_job_id uuid not null references capital_jobs on delete cascade,
  warranty_type text not null,                    -- 'workmanship'|'pavement_performance'|'manufacturer'|'maintenance_bond'
  starts_on date not null,                        -- usually capital_jobs.completed_at
  ends_on date not null,
  covers_categories text[],                       -- NULL = all; else Civic report categories
  bond_ref text,
  bond_value_cents bigint,
  notes text
)

-- A utility cut / trench: permittee is liable for restoration for a liability window.
utility_permits (
  id uuid pk,
  city_id uuid not null references cities,
  permittee_name text not null,
  permittee_contractor_id uuid references contractors,
  permit_ref text,
  trench geography(GEOMETRY, 4326) not null,
  restored_on date,
  liability_ends_on date,                         -- restored_on + city's degradation window
  source text not null default 'manual',
  source_external_id text,
  created_at timestamptz not null default now()
)

-- The verdict, one row per report. Immutable snapshot + a recomputable flag.
report_liability (
  report_id uuid pk references reports on delete cascade,
  verdict text not null,                          -- 'contractor_warranty'|'utility_restoration'|'city_cost'|'unknown'
  capital_job_id uuid references capital_jobs,
  warranty_id uuid references warranties,
  utility_permit_id uuid references utility_permits,
  liable_contractor_id uuid references contractors,
  window_ends_on date,                            -- when liability lapses; drives the expiry sweep
  match_distance_m numeric,                       -- how far the report was from the footprint
  confidence numeric not null,                    -- 0..1, see §3.3
  evaluated_at timestamptz not null default now(),
  is_stale boolean not null default false         -- set true when source data changes → re-evaluate
)
```

Indexes: GIST on `capital_jobs.footprint`, `utility_permits.trench`; btree on
`report_liability.window_ends_on WHERE verdict <> 'city_cost'` (the sweep query);
btree on `capital_jobs (city_id, completed_at)`.

Add `'camera'` to `reports_source_check` in the same migration (needed by Phase B,
harmless now).

### 3.2 The join (`lib/liability/evaluate.ts`)

Runs at report creation, after classification, before dispatch. Pure function over
DB rows so it is unit-testable without a live DB.

```
1. Candidate capital jobs:
     ST_DWithin(footprint, report.location, tolerance_m)
     AND completed_at <= report.created_at
     AND job_type is compatible with report.category
   tolerance_m per city (default 15m, a road centerline is not the pothole).
   NOTE: no city-level settings table exists today (migration 024 is *named*
   city_config but creates city_departments/category_routing/sla_targets/
   cost_rules/provision_jobs). Store tunables as columns on `cities` or a new
   `city_settings` table, decide at implementation.

2. For each candidate, find warranties where
     report.created_at::date BETWEEN starts_on AND ends_on
     AND (covers_categories IS NULL OR report.category = ANY(covers_categories))

3. Candidate utility permits:
     ST_DWithin(trench, report.location, tolerance_m)
     AND report.created_at::date <= liability_ends_on

4. Precedence when both hit:
     utility_restoration > contractor_warranty
   Rationale: a trench cut through new pavement is the permittee's failure, not
   the paving contractor's, and paving contracts routinely exclude third-party
   cuts. Precedence is configurable per city; the default is documented, not
   silently hardcoded.

5. Nearest match wins within a type. Ties → lowest match_distance_m, then most
   recent completed_at.

6. No hit → verdict 'city_cost'. Missing source data for the city → 'unknown'
   (NOT 'city_cost', an empty capital_jobs table must not be reported as
   "city pays", that is a silent-failure trap).
```

### 3.3 Confidence, and why it must be visible

`confidence` combines: distance to footprint (closer = higher), category, job-type
compatibility (a pothole on a resurfacing job = high; a streetlight outage on a
resurfacing job = zero), and whether the footprint is a real surveyed geometry or
a coarse manual sketch (`capital_jobs.source`).

The UI **never** shows a bare "contractor liable". It shows the verdict, the
contract reference, the distance, and the confidence, because a wrong claim
damages a vendor relationship the city needs at the next bid.

### 3.4 Surfaces

- **Report detail / work-order detail**: liability badge.
  `Under warranty, Contractor X, contract #2024-17, expires 2026-11-04 (47 days)`
  vs `Out of warranty (city cost` vs `Utility restoration) Telecom Y, permit #P-8821`.
- **Dispatch warning (soft, not a block)**: dispatching a crew to a warranty-covered
  defect spends city labor on a contractor's obligation *and* destroys the evidence.
  Warn, require an explicit acknowledgement, log the override. Never hard-block.
  Hazards must always be fixable immediately.
- **Expiry sweep** (`/admin/liability` + a daily job): capital jobs whose warranty
  lapses in 60/30/7 days, with their open defect count. This is the highest-ROI
  screen in the whole spec, it converts "we forgot" into a worklist.
- **Contractor scorecard**: defect rate per contractor per job, normalized by
  footprint length and months-since-completion. Feeds procurement.

### 3.5 Getting the data in

The hard truth: most small cities have no digital contract-to-geometry mapping.

- **v1. Manual + CSV.** A paving schedule is typically one spreadsheet a year,
  ~50 rows. Admin screen: upload CSV → map columns → draw or import footprint.
  Reuse the `src/lib/import/normalize.ts` column-mapping shape from F5's CSV adapter.
- **v2, ArcGIS.** Cities that have a capital-projects Feature Service get the F5
  ArcGIS adapter pointed at it. Same reprojection and pagination code.
- **Utility permits** usually live in a permitting system (Accela, CityView, or a
  spreadsheet). v1 = CSV. Trench geometry is often just "Main St from 1st to 3rd",
  spec a street-segment resolver as a *later* item, not v1; v1 accepts a drawn line.

Onboarding honesty: a city with an empty `capital_jobs` table gets `unknown`
verdicts and an empty-state that says "add your paving schedule to enable warranty
tracking". Not a fake "city cost" everywhere.

---

## 4. Phase B: Camera ingest

**Decisions taken:** vehicle-mounted feed (school bus / fleet), detector runs
server-side in an ingest worker.

### 4.1 Why vehicle-mounted over fixed traffic cams

Fixed signal cameras point at the intersection, not the road surface; their FOV
covers a fraction of a percent of the network; most municipal cams are low-res and
not API-reachable. A bus route grid re-covers the whole city daily at a consistent
head-on pavement angle with vehicle GPS attached. Fixed cams stay a stubbed adapter
behind the same frame contract, useful later for flooding and debris, not pavement.

### 4.2 Ingest contract

```ts
// POST /api/camera/frames   (auth: api_keys, scope 'camera:ingest')
interface FrameBatch {
  deviceId: string;            // registered camera_devices row
  frames: Array<{
    externalId: string;        // device-local frame id, idempotency key
    capturedAt: string;        // ISO
    lng: number; lat: number;
    headingDeg?: number;
    speedMps?: number;         // used to reject motion-blurred frames
    imageBase64OrUrl: string;
  }>;
}
```

Batch upload on depot wifi. No realtime pressure, no cell-data cost, no
uptime SLA on a school bus.

New table `camera_devices (id, city_id, label, vehicle_ref, kind, active, …)`.
Kind: `'vehicle'|'fixed'`. RLS: staff read, admin write. API key scopes the city.

### 4.3 The detector gate: the cost model

An LLM call per frame is economically impossible: one bus, one route, one day is
tens of thousands of frames. The detector exists to throw ~95% of them away before
any LLM is involved.

- **Task**: bounding-box detection of road damage classes (longitudinal crack,
  transverse crack, alligator crack, pothole).
- **Dataset family**: RDD2022 / Crowdsensing Road Damage Detection Challenge, the
  standard public corpus, with abundant published fine-tunes. The user's read that
  "there are tons of free models" is correct.
- **Licensing is a selection criterion, not an afterthought.** Ultralytics
  YOLOv8/v11 is **AGPL-3.0**, a real problem for a commercial hosted product.
  Prefer Apache-2.0/BSD architectures (YOLOX, RT-DETR family, or a from-scratch
  fine-tune on a permissively licensed backbone). **Verify current options and
  their licenses at implementation time. Do not treat any checkpoint named in
  this spec as settled.**
- **Runs where**: a Python sidecar service (FastAPI + ONNX Runtime), not in the
  Next.js process. Next calls it over HTTP. This keeps the Node app free of a
  model runtime and lets the detector scale and be swapped independently.
- **Output per frame**: zero or more `{bbox, class, score}`. Below threshold →
  frame is dropped and never stored. Above → crop is retained.

Edge deployment (a Jetson in the vehicle pre-filtering before upload) is a
documented upgrade path: the frame contract is unchanged, the device simply
uploads fewer frames. Not v1. Hardware procurement and OTA model updates are a
pilot blocker, not a feature.

### 4.4 Detection clustering: the volume problem

A bus passes the same pothole ~20×/day across ~180 school days. Naively, that is
~3,600 reports for one pothole. The existing `find_duplicate_report` RPC
(50m / 30-day, per-report) was sized for resident volume and will not hold.

Clustering happens **before** a report is ever created:

```
detections (
  id, device_id, city_id,
  frame_external_id, captured_at,
  location geography(POINT,4326),
  damage_class text, score numeric,
  crop_url text,                 -- blurred crop, public bucket
  cluster_id uuid references detection_clusters,
  report_id uuid references reports   -- set when the cluster is promoted
)

detection_clusters (
  id, city_id,
  centroid geography(POINT,4326),
  damage_class text,
  first_seen_at, last_seen_at,
  observation_count int,
  peak_score numeric,
  promoted_report_id uuid references reports,
  state text  -- 'observing'|'promoted'|'resolved'|'dismissed'
)
```

- New detection joins an existing cluster when within `cluster_radius_m`
  (default 8m, GPS error on a moving vehicle, not the 50m report radius) **and**
  same `damage_class` **and** cluster not `resolved`.
- Promotion to a report requires a **confirmation threshold**: N distinct passes
  on ≥2 distinct days (default N=3). Kills one-frame false positives, a shadow, a
  wet patch, a manhole, without a human in the loop.
- Only the promotion event calls Gemini, and only on the best crop
  (highest score, sharpest, lowest speed). One LLM call per real defect, not per frame.
- A cluster whose report closes goes `resolved`. Later detections at the same spot
  open a **new** cluster, which is exactly the recurrence signal the
  `analytics_recurring_hotspots` RPC (037, a function, not a table) wants, and it feeds the contractor scorecard
  (a defect that reappears after a "repair" is a workmanship claim).

### 4.5 Privacy: the hardest constraint, and it breaks today's design

`agents.md` rule #2: faces and license plates are blurred **client-side before
upload**, `photos-raw` is 30-day TTL with restricted RLS, `photos-public` never
sees an unblurred byte.

Camera ingest has no client to blur in, and street footage is saturated with
plates and faces. This requires:

- A **server-side blur stage** in the ingest worker, running before anything is
  written to `photos-public`. Same detector sidecar can host a face/plate model.
- Raw frames land in `photos-raw` (existing restricted bucket, existing TTL, see
  `039_raw_photo_retention.sql` and `040_blur_version.sql`) or are **never
  persisted at all**, preferred: blur in-flight, persist only the blurred crop.
- `blur_version` stamping on camera crops so a model upgrade can trigger re-blur,
  reusing the existing column.

**`lib/privacy/` is explicitly stop-and-ask territory per `agents.md` rule #10.**
This spec proposes a *new* `src/lib/privacy/blur-server.ts` alongside the untouched
client path, and flags it as requiring explicit approval before implementation.

Additional exposure worth a policy decision before a pilot: continuous municipal
vehicle imagery is a surveillance surface regardless of blur. Recommend
(a) persist only crops, never full frames, (b) no ALPR-capable storage, ever,
(c) a public-facing description of what the fleet captures and retains.

### 4.6 KPI isolation

Camera reports get `source = 'camera'`. Per F5 §8 and migration 024, public KPI
RPCs count `'resident'` only. Camera volume must not inflate or deflate resident
metrics, and a city that suddenly files 400 camera defects must not appear to have
a citizen-engagement spike. Staff dashboards show all sources with a badge.

Open311 export (`agents.md` rule #5): camera reports export like any other report;
`service_code` maps from category as usual. Attribution fields are Civic
extensions and stay out of the conformant payload.

---

## 5. Phase C: Claim packet

**Decision taken:** staff-approved queue, not auto-send.

### 5.1 Packet contents

Assembled by `lib/liability/packet.ts`, one per `report_liability` row with a
non-`city_cost` verdict:

- Defect: category, hazard grade (044), severity, dimensions if the classifier
  gave them, address, coordinates.
- Evidence chain: blurred photo(s), capture timestamp, GPS, device/reporter,
  and for camera detections the observation history (N passes over M days, which
  is materially stronger evidence than a single citizen photo).
- Liability basis: contract ref, contractor, job completion date, warranty type
  and window, days remaining, match distance, confidence.
- For utility claims: permit ref, permittee, restoration date, liability window.
- Requested action + the city's contractual response window.
- Open311-style stable identifier so the contractor can reference it back.

### 5.2 Flow

```
report_liability.verdict != 'city_cost'
  → claim row created, state 'draft'
  → /admin/claims review queue: staff sees packet, edits, approves or dismisses
  → on approve: work_orders.contractor_id set, contractor_status 'assigned',
    packet delivered via src/lib/notify/outbox (email + contractor portal)
  → contractor responds through the existing portal:
    accepted | declined | in_progress | complete   (053 lifecycle, unchanged)
  → declined → dispute state, staff decides: escalate, or absorb as city cost
  → resolution recorded with recovered value
```

```sql
claims (
  id uuid pk,
  city_id uuid not null references cities,
  report_id uuid not null references reports,
  liable_contractor_id uuid references contractors,
  basis text not null,                 -- 'warranty'|'utility_restoration'
  state text not null,                 -- 'draft'|'approved'|'sent'|'accepted'|'declined'|'disputed'|'resolved'|'dismissed'
  packet jsonb not null,               -- immutable snapshot at send time
  estimated_value_cents bigint,
  recovered_value_cents bigint,
  sent_at, responded_at, resolved_at timestamptz,
  created_by uuid references users,
  created_at timestamptz not null default now()
)
```

`packet` is a snapshot, not a live join: if a capital job row is later corrected,
the claim as sent must remain reproducible.

### 5.3 Batching beats per-claim economics

An individual $800 pothole claim costs more staff time than $800, which is
precisely why cities skip them. Automated assembly plus **monthly batching per
contractor** (one letter, N defects) flips that. The queue supports selecting
many drafts and approving them as one delivery.

### 5.4 Recovery ledger

`/admin/liability` totals: claims sent, accepted, declined, dollars recovered,
dollars still in-window and unclaimed. This is the renewal argument and it should
exist from day one of Phase C, not be bolted on.

---

## 6. Error handling and failure posture

Follows the existing `{ ok: true, data } | { ok: false, error }` convention and
the pipeline's fallback-everywhere invariant.

| Failure | Behavior |
|---|---|
| Detector sidecar down | Frames queue; batch retried. Ingest never blocks report creation from other sources. Alert after N minutes. |
| Blur model fails on a crop | **Drop the crop. Never fall back to publishing unblurred.** Hard rule, non-negotiable. |
| Gemini fails on a promoted cluster | Existing fallback classification (`category:'other'`). The cluster still becomes a report; classification is retried. |
| Liability join finds no source data | `verdict = 'unknown'`, not `'city_cost'`. Empty-state prompts the city to load its schedule. |
| Liability join is ambiguous (overlapping jobs) | `verdict` set with low `confidence`; queue flags it for staff instead of guessing. |
| Capital job or permit edited after evaluation | `report_liability.is_stale = true`; nightly re-evaluation for open reports only. Sent claims are never retroactively changed. |
| Contractor disputes | Explicit `disputed` state. The system records; it does not adjudicate. |

---

## 7. Testing

- **Unit**: `evaluate.ts` precedence and confidence over fixture rows; clustering
  join/promotion rules; packet assembly snapshot shape. All pure-function,
  no DB, co-located `*.test.ts` per house style.
- **PostGIS integration**: seeded jobs/permits/reports with known geometries.
  Point inside footprint, point 12m off, point on an overlapping trench, point
  one day after warranty expiry, point one day before.
- **RLS regression** (`tests/rls/`, required by `agents.md` #3): every new table.
  Critical cases: a contractor cannot read `capital_jobs`, cannot read other
  contractors' `claims`, cannot read `report_liability` for unassigned reports;
  city A cannot read city B's anything.
- **Golden detections**: extend `tests/golden/` with frames whose expected
  detector output and cluster promotion are known, including negatives
  (shadow, manhole, wet patch, tar snake).
- **Privacy audit**: extend `pnpm audit:privacy` to assert no unblurred camera
  crop ever reaches `photos-public`.

---

## 8. Open decisions

1. **Utility-vs-warranty precedence default**: spec'd as utility-first, per-city
   configurable. Confirm this matches how a real city attorney would read it.
2. **`cluster_radius_m` and promotion threshold N**: 8m / 3 passes over 2 days
   are estimates. Tune against real fleet data; expose as per-city tunables
   (see §3.2 note, no city_config table exists; needs `cities` columns or a
   new `city_settings` table).
3. **Persist raw frames at all?** Recommend no, blur in-flight, store crops only.
   Cheaper, and it removes the surveillance-archive question entirely.
4. **Detector hosting**: Python sidecar (recommended: keeps model runtime out of
   Next) vs a managed inference endpoint. Sidecar means a deploy target decision,
   which `agents.md` notes is still unresolved for the app itself.
5. **Street-segment resolver** for utility permits described as "Main St from 1st
   to 3rd", deferred past v1; v1 accepts a drawn line.
6. **Does the pilot city have any of this data?** Cumming's `org_units` tree is
   already known to be inert. Before building Phase A's importer, confirm a real
   paving schedule and permit list exist in *some* machine-readable form.

---

## 9. Stop-and-ask items (per `agents.md`)

Every one of these requires explicit user approval before implementation:

- New tables / data-model change (Phase A, B, C all touch it).
- `supabase/migrations/` additions.
- Anything under `lib/privacy/`, the server-side blur worker.
- New dependencies: ONNX Runtime / detector sidecar (Python, outside the pnpm tree).
- Open311 export behavior for camera-sourced reports.
