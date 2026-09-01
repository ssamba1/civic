# src/lib/

Everything that is not a route and not a component. Thirty-odd domain folders
plus a layer of loose files at the root.

The rule that decides whether something belongs here: **a module in `lib/` can
be tested without mounting React.** If it needs a DOM to be meaningful, it is a
component.

## The spec-critical folders

Three directories are load-bearing in a way the rest are not, and `agents.md`
rule 10 puts them behind an explicit ask:

| Folder | Why it is protected |
| --- | --- |
| `open311/` | Open311 GeoReport v2 conformance. An external agency's ingest breaks if the shape changes. |
| `privacy/blur.ts` | The only thing standing between a raw photo and the public bucket. |

Read them before changing anything that feeds them.

## `ai/` — the model layer

The one hard rule: **Gemini is never called from the client.** Everything routes
through `/api/ai/*`. Nothing in this folder should ever be imported by a
`"use client"` module.

`classify-pipeline.ts` is the spine — photo in, classified and dispatched report
out. It composes:

- `gemini.ts` — the actual model call.
- `prompt.ts` / `classification-schema.ts` — prompt construction and the schema
  the response is parsed against.
- `categories.ts` — merges the twelve builtins with a city's own `issue_types`,
  so the classifier is offered `BUILTIN ∪ city` on every request.
- `dedup.ts` — finds an earlier open report of the same category within
  `DEDUP_RADIUS_M`. Behind `DEDUP_REPORTS`, off by default.
- `hazard-grade.ts`, `work-order-ai.ts`, `work-order-rules.ts` — severity, then
  the work order.
- `crew-assign.ts` — `pickCrew`, a pure five-criterion comparator. **No model
  call in it.**

That last point is the design, not an implementation detail. The model decides
*what the photograph shows*. Everything after — division, crew, cost, SLA — is
deterministic. A misclassification therefore delays a job; it cannot invent or
misprice one.

`work-order-rules.ts` holds the cost table: a labour rate times the rule's
minutes plus a flat material cost. Boring on purpose — a dollar figure on a
municipal work order has to be defensible in a public meeting, and a rules table
can be printed and argued with in a way a model's output cannot.

### The two rate limiters are not duplicates

`rate-limit.ts` and `rate-limiter.ts` look like the same file twice. They are
not, and deleting either breaks something:

- **`rate-limit.ts`** — in-memory fixed window, per key, guarding *endpoints*.
  State is a module-level `Map`, so counters are per-instance and reset on cold
  start; under multi-instance scale the real limit is `instances × max`.
- **`rate-limiter.ts`** — cumulative sliding window over *all* Gemini calls in
  the process, per-minute / per-hour / per-day, tuned by `GEMINI_RPM` and
  friends. This is the cost ceiling, not an abuse control.

One protects the route. The other protects the bill.

### Flags

`config.ts` is the single place feature flags are read. `AI_WORK_ORDER`,
`AI_CREW_ASSIGN` and `DEDUP_REPORTS` are all opt-in — a city switches on
auto-merging of a resident's report knowingly rather than discovering it.
Anything prefixed `NEXT_PUBLIC_` reaches the browser and must be safe to expose.

## `video/` — the LLM-free-first pipeline

`detector.ts` → `track.ts` → `cluster.ts` → `decide.ts`. Frames are scanned by a
local ONNX detector at no model cost, Postgres clusters the detections, and only
a cluster that survives a confidence threshold reaches `decide.ts` and costs a
Gemini call. `phash.ts` catches near-duplicate frames before any of that.

The ordering *is* the cost argument: put the model first and every frame is
billable.

## `db/` — one module per table

`client.ts` (server), `ssr-client.ts`, `browser-client.ts` — pick by execution
context; mixing them is the usual source of "works locally, empty in
production", because a missing service key renders pages empty and *healthy*.

Geo queries use PostGIS (`ST_DWithin` against a GiST index), never haversine in
application code.

## The rest

| Folder | Contents |
| --- | --- |
| `privacy/` | On-device blur, EXIF strip, PII redaction, retention sweeps, the audit that `pnpm audit:privacy` runs. |
| `open311/` | GeoReport v2: service catalogue, transform, XML serialisation, partner API keys. |
| `onboarding/` | City provisioning — TIGER boundary lookup, state FIPS, presets, the config template the wizard writes. |
| `routing/` | Org units, jurisdiction resolution, and the flow data behind `/city/[slug]/routing`. |
| `liability/` | Claim state machine, evaluation, packet generation, sweeps. |
| `notify/` | Outbox, SMS and email delivery, status notifications, CSAT. |
| `analytics/` | Benchmarks, equity, heatmaps, peer comparison. |
| `staff/` | Bulk actions, merges, route optimisation, scheduling, surge. |
| `camera/`, `camera-demo/` | Fixed-camera ingest and clustering; the demo's scripted promotions. |
| `weather/` | NWS client, baselines, storm advisories. |
| `webhooks/` | Dispatch, delivery, and `url-guard.ts` — SSRF protection on customer-supplied URLs. |
| `i18n/` | Six-locale dictionary and lookup for the resident-facing pages. |
| `documents/`, `import/`, `integrations/`, `compliance/`, `qr/`, `automation/` | Smaller domains, one concern each. |
| `utils/` | Genuinely generic helpers only — `cn`, `phash`, `time-ago`, focus trap. Domain logic does not belong here. |

## The root files

Thirty-six loose `.ts` files sit directly in `lib/` — `dashboard-data.ts`,
`teams-data.ts`, `public-token.ts`, `demo-mode.ts` and so on. Most predate the
folder structure and are page-level data assembly rather than a reusable domain.

New code should land in a folder. When touching a root file substantially,
moving it into one is welcome; just do it as its own commit, because the import
churn otherwise buries the actual change.

## Conventions

- Server code by default. `"use client"` only where interactivity demands it.
- Server actions return tagged results — `{ ok: true, data } | { ok: false, error }`.
  Throwing is for unreachable code.
- Tests co-locate: `foo.test.ts` beside `foo.ts`.
- `timestamptz` for time, `geography(POINT, 4326)` for location, everywhere.
- No `any` without a one-line comment saying why.
