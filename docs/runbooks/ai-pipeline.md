# Runbook: fcamera AI Pipeline

How a citizen photo becomes a classified report and a dispatched work order, plus
the robustness, privacy, rate-limiting, and optional-async machinery around it.

This documents the pipeline **as it now exists**. The synchronous path is the
default and the only path exercised in the demo. The asynchronous path is
feature-flagged **off** and, when off, must behave byte-identically to the
synchronous path.

---

## 1. End-to-end flow (capture → blur/normalize → upload → classify → work order)

```
                         BROWSER (client)
  ┌──────────────────────────────────────────────────────────────┐
  │ report/page.tsx                                                │
  │   CameraCapture ──▶ PhotoPreview ──▶ submit                    │
  │                                                                │
  │   blurFacesAndPlates(photo)   [lib/privacy/blur.ts]            │
  │     ├─ blurred  WebP  (faces + plate heuristic, downscaled)    │
  │     └─ original JPEG  (EXIF baked into pixels, downscaled)     │
  │                                                                │
  │   both base64-encoded ──▶ submitReport(...)  (Server Action)   │
  └──────────────────────────────┬─────────────────────────────────┘
                                  │  single Server Action request (<1 MB)
                         SERVER (Node runtime)
  ┌──────────────────────────────▼─────────────────────────────────┐
  │ report/actions.ts  submitReport()                              │
  │   1. zod-validate input                                         │
  │   2. auth via SSR (cookie) client; anon session is fine        │
  │   3. resolve / self-heal reporter city                         │
  │   4. upload blurred WebP  → photos-public  (service role)       │
  │   5. upload original JPEG → photos-raw      (service role)      │
  │   6. insert reports row   (SSR client, RLS backstop)           │
  │   7a. SYNC  (default): await runClassifyPipeline(reportId)      │
  │   7b. ASYNC (flag on):  void runClassifyPipeline(reportId)      │
  └──────────────────────────────┬─────────────────────────────────┘
                                  │  in-process call — NO HTTP round-trip
  ┌──────────────────────────────▼─────────────────────────────────┐
  │ lib/ai/classify-pipeline.ts  runClassifyPipeline()             │
  │   a. read reports row (service role, RLS-bypassing)            │
  │   b. download photos-raw/{city}/{id}.jpg   (the ORIGINAL)      │
  │   c. sniffImageMime(bytes) → real MIME                          │
  │   d. classifyPhoto(base64, mime)  → Gemini  [lib/ai/gemini.ts] │
  │   e. upsert classifications row (raw text + sniffed mime)      │
  │   f. emergency? → reports.status = "dispatched", return        │
  │      else → generateWorkOrder(...) → insert work_orders        │
  │      → reports.status = "dispatched"                           │
  └────────────────────────────────────────────────────────────────┘
```

Key facts that are easy to get backwards:

- **The classifier reads the RAW (unblurred) original**, not the public blurred
  copy. The pipeline downloads `photos-raw/{city_id}/{report_id}.jpg`. The blurred
  public copy has faces/plates obscured, which degrades classification accuracy,
  so it is never sent to Gemini.
- **The demo submit flow calls `runClassifyPipeline` directly, in-process.** There
  is no HTTP self-call. `submitReport` imports and invokes the pipeline function.
- **`/api/ai/classify` is a separate, parallel entry point** for external/internal
  callers (Open311, background jobs) — it is *not* on the main capture path. It
  wraps the same `runClassifyPipeline` behind its own auth + rate limit + ownership
  check (see §5). The synchronous demo never needs `INTERNAL_CLASSIFY_SECRET`.

### Storage layout

| Bucket         | Object                         | Content       | Audience                         |
| -------------- | ------------------------------ | ------------- | -------------------------------- |
| `photos-public`| `{city_id}/{report_id}.webp`   | blurred WebP  | public (`getPublicUrl`)          |
| `photos-raw`   | `{city_id}/{report_id}.jpg`    | original JPEG | staff-only, signed-URL, 30-day TTL |

Both uploads use the **service role** client. Storage RLS has no INSERT policy
(folder-scoping can't be set via the pooler), so the server writes them. Privacy
is preserved because the blur already ran client-side before upload. On `photos-raw`
upload failure the already-uploaded public object is removed; on `reports` insert
failure both objects are removed.

---

## 2. The image-parsing fix — why Gemini gets the correct MIME now

This is a two-part causal chain. Both halves must hold for Gemini to receive an
image it can actually decode and orient correctly.

### (a) Client bakes orientation and guarantees a Gemini-supported format

`lib/privacy/blur.ts` → `blurFacesAndPlates()` decodes the camera/library file
**once** with EXIF orientation applied:

```ts
createImageBitmap(imageFile, { imageOrientation: "from-image" })
```

That upright bitmap feeds both outputs. The `original` returned to the caller is
**not a raw passthrough**: it is re-encoded through canvas via
`bitmapToJpeg(...)` (`lib/image/normalize.ts`), which draws the bitmap onto a
2D canvas and calls `canvas.toBlob(..., "image/jpeg", quality)`. Result:

- EXIF orientation is **baked into the pixels** (so a sideways phone photo arrives
  upright — no orientation tag for a downstream decoder to mis-handle), and
- the output is **guaranteed `image/jpeg`** — a format Gemini supports. A
  library-picked **HEIC** never reaches the server as HEIC (HEIC also fails to
  decode in `createImageBitmap` on desktop/Android Chrome, which is caught
  client-side — see §8).

Both encodes are downscaled to a long edge of `MAX_OUTPUT_EDGE = 1280` so the two
base64 blobs fit inside one Server Action request under Next's default ~1 MB body
limit (`serverActions.bodySizeLimit` is not configured; `next.config` is out of
scope). Without this cap a full-resolution phone photo's two blobs blow past the
limit and the action body is silently rejected.

### (b) Server sniffs the actual bytes and labels the request with that

In `classify-pipeline.ts` the downloaded bytes are passed through
`sniffImageMime(bytes)` (`lib/image/sniff-mime.ts`), a pure, dependency-free
magic-byte detector (JPEG `FF D8 FF`, PNG, GIF, WebP `RIFF…WEBP`, HEIC/HEIF
`ftyp` brands). The sniffed value — **not** a filename or a stored content-type —
is passed to Gemini as `inlineData.mimeType`:

```ts
const sniffed = sniffImageMime(bytes) ?? "image/jpeg";
// ...
classifyPhoto(imageBase64, sniffed); // mimeType = the sniffed value
```

So the MIME label always matches the actual bytes. The `?? "image/jpeg"` default
is safe precisely because the `photos-raw` bucket is always orientation-baked JPEG
(from step (a)); the fallback only fires on an unrecognized signature.

The sniffed MIME is also persisted on the `classifications` row
(`raw_response.mime`) for observability.

---

## 3. Gemini robustness (classification)

`lib/ai/gemini.ts` → `classifyPhoto(imageBase64, mimeType)` returns a
`Result<{ classification, rawText }>` and **never throws to the caller** — all
errors are returned as `{ ok: false, error }`.

- **Structured output.** The model is created with
  `generationConfig.responseMimeType = "application/json"` and
  `responseSchema = GEMINI_CLASSIFICATION_SCHEMA`
  (`lib/ai/classification-schema.ts`). The schema mirrors the zod
  `classificationSchema`: `category` (enum of 12 categories), `subcategory`,
  `severity` (INTEGER 1–5), `hazard_radius_m`, `visible_size_estimate`,
  `is_emergency`, `confidence` (0–1), `reasoning`. The prompt
  (`lib/ai/prompt.ts`) also instructs JSON-only output.
- **Belt-and-suspenders parsing.** Even with structured output, `stripCodeFences`
  removes any ```` ```json ```` fences before `JSON.parse`. Parse failure →
  `ok:false`. The parsed object is then re-validated with
  `classificationSchema.safeParse`; validation failure → `ok:false` with the zod
  issues. The **raw model text is preserved verbatim** (`rawText`) so what the
  model actually said is persisted, independent of the parsed copy.
- **Retry / backoff.** The `generateContent` call is wrapped in `withRetry`
  (`lib/ai/retry.ts`): up to `AI_MAX_RETRIES = 2` retries beyond the first attempt,
  exponential backoff `AI_RETRY_BASE_MS * 2**attempt` (base 400 ms) plus random
  jitter. The retry predicate `defaultIsRetryable` retries on `AbortError`
  (timeouts), HTTP 429/500/502/503/504, and network/transient message patterns
  (`timeout`, `network`, `econnreset`, `overloaded`, `rate`, etc.). Non-retryable
  errors are rethrown immediately.
- **Timeout.** Each attempt gets a fresh `AbortSignal` that aborts after
  `AI_TIMEOUT_MS = 30000` ms; the timer is always cleared in `finally`. The signal
  is also forwarded to the SDK call.

### Config (all in `lib/ai/config.ts`)

| Constant            | Value             | Meaning                                           |
| ------------------- | ----------------- | ------------------------------------------------- |
| `GEMINI_MODEL`      | `gemini-2.5-flash`| model for all classification + reasoning calls    |
| `AI_TIMEOUT_MS`     | `30000`           | per-attempt abort timeout                         |
| `AI_MAX_RETRIES`    | `2`               | retries beyond the first try                      |
| `AI_RETRY_BASE_MS`  | `400`             | base backoff, grows exponentially                 |
| `AI_RATE_LIMIT`     | `{windowMs:60000, max:20}` | fixed-window limit for AI endpoints      |
| `ASYNC_CLASSIFY`    | `process.env.NEXT_PUBLIC_ASYNC_CLASSIFY === "1"` | async flag (default off) |

`config.ts` is pure constants + env reads, no side effects, safe to import from
client or server (the report page imports `ASYNC_CLASSIFY` client-side).

SDK: legacy `@google/generative-ai` v0.24.1 (`GoogleGenerativeAI`,
`getGenerativeModel`).

---

## 4. The reasoning hybrid (real Gemini + LRU cache + template fallback)

`lib/ai/reasoning-ai.ts` produces a municipal **cost breakdown + severity-scoring
rationale** for a single report. This is a *different* Gemini wrapper from
classification, with a different error contract:

- `geminiReasoning(...)` builds a text-only prompt from report metadata
  (category, severity, status, address, age in days, SLA hours), calls Gemini with
  its own `REASONING_SCHEMA` (`{ reasoning, costBreakdown[], scoringExplanation[] }`),
  parses with `JSON.parse`, runs an `isReasoningPayload` shape guard, and **throws**
  on transport failure or malformed output. It is wrapped in the same `withRetry`
  + `AI_TIMEOUT_MS` machinery.
- `getReasoning(input, slaHours, categoryLabel, templateFallback)` is the
  orchestrator with **three-tier sourcing**, returning a `source` tag for
  observability:
  1. `cache` — a previously computed Gemini result for this report id.
  2. `gemini` — freshly generated, then cached.
  3. `template` — the deterministic `templateFallback()` used on **any** Gemini
     error (the `throw` is caught here).

  Only successful Gemini results are cached; template fallbacks are **not** cached,
  so a transient failure does not poison the cache for that report id.

### Cache

Module-level `Map<string, ReasoningPayload>` keyed by report id, used as an
**LRU** with `CACHE_MAX = 500`. `cacheGet` refreshes recency by delete+re-set
(moving the entry to newest). `cacheSet` evicts the oldest insertion-order key
until under the cap. In-memory only — resets on cold start, per-instance.

### Endpoint: `/api/ai/reasoning`

- Auth: valid user session **or** internal-key header (§5).
- Rate-limited for non-internal callers, keyed `reasoning:{ip}`.
- Looks up the report in the **in-memory dashboard corpus** via
  `getReportCorpus()` (`lib/dashboard-data`) — **not** the live `reports` table.
  (Classification uses the DB; reasoning does not.)
- Calls `getReasoning(...)` with `templateReasoningForReport(report)` as the
  fallback. That template is a large deterministic table of cost/scoring sections
  keyed by severity 1–5. Because the fallback is swallowed inside `getReasoning`,
  this endpoint **never dead-ends** on a Gemini failure — the only non-200s are the
  intentional auth/limit/validation gates.

---

## 5. Rate limiting & route auth

`lib/ai/rate-limit.ts` is an **in-memory fixed-window** limiter:

- Module-level `Map<key, {count, resetAt}>`. `checkRateLimit(key, cfg?)` returns
  `{ allowed, retryAfterMs }`. Default window/`max` come from
  `AI_RATE_LIMIT` (20 requests / 60 s).
- `clientIp(req)` resolves a best-effort IP: first `x-forwarded-for` entry, else
  `x-real-ip`, else `"unknown"`.

Both AI routes (`/api/ai/classify`, `/api/ai/reasoning`) apply the same auth
**components** — but the check order differs (see the note below):

1. **Internal-key bypass.** Read the `x-internal-key` header and compare it to
   `process.env.INTERNAL_CLASSIFY_SECRET` with `timingSafeEqual` (length-checked
   first to avoid the throw on unequal-length buffers). Internal callers
   (background jobs, Open311 — **not** the demo server action, which calls
   `runClassifyPipeline` directly in-process) are **exempt from the rate limit**
   and from the session/ownership checks — they are trusted and not user-facing.
2. **Rate limit** non-internal callers (`classify:{ip}` / `reasoning:{ip}`) →
   `429` with a `Retry-After` header (seconds) when blocked.
3. **Session check** — non-internal callers without a Supabase user → `401`.
4. **Object-level authorization (classify only).** Because the pipeline runs under
   the RLS-bypassing service role, an authenticated non-internal caller must not be
   able to re-classify an arbitrary report. The route does an RLS-scoped read via
   the cookie-aware SSR client; if no row comes back (not owner / not staff for the
   city) it returns **`404`** (does not disclose existence). The internal-key path
   skips this.

> **Check-order difference.** `/api/ai/classify` runs **rate-limit before session**;
> `/api/ai/reasoning` runs **session before rate-limit**. Observable effect: a
> non-internal, unauthenticated, over-limit caller gets `429` from classify but
> `401` from reasoning.

> **Multi-instance caveat.** Both the rate-limit window and the reasoning cache
> live in per-process module memory. They reset on cold start (serverless) and are
> **not shared across instances**, so under N instances the effective rate limit is
> roughly `N × max`. For real distributed limiting, swap the `Map` for Upstash/Redis
> with an atomic `INCR` + TTL.

---

## 6. The optional async classification path

Default **off**. Enabled only when `NEXT_PUBLIC_ASYNC_CLASSIFY === "1"`.

### How to enable

1. Set `NEXT_PUBLIC_ASYNC_CLASSIFY=1`.
2. Apply migration 007 explicitly: `npm run db:migrate`. **It is not auto-applied.**

### What changes when on

- **Insert** (`actions.ts`): the `reports` row gains `classify_status: "pending"`
  (via a conditional spread — see §7). When off, the row is bare.
- **Dispatch** (`actions.ts`): instead of awaiting, the pipeline is fired
  fire-and-forget (`void runClassifyPipeline(reportId).catch(...)`) and the action
  returns immediately with a neutral **pending** classification
  (`confidence: 0`, "Classification pending").
- **Status stamping** (`classify-pipeline.ts`): `markClassifyStatus` writes
  `classify_status` `done`/`failed` as a **separate** update (never merged into the
  primary `status:"dispatched"` write — so a missing column can only drop the
  status stamp, never the real status transition). Errors are logged, never thrown.
- **Realtime (resident UI)** (`page.tsx`): on a pending result the page subscribes
  to a Supabase Realtime `INSERT` on `classifications` filtered by
  `report_id=eq.{id}`. The INSERT payload carries the full classification, so no
  follow-up fetch is needed on the happy path. RLS (`classifications_select_own`)
  authorizes the reporter.
  - **Subscribe-after-fire race:** the classify is fired server-side before the
    client subscribes, so an INSERT can land before the channel is live. Mitigation:
    once subscribed, do a **one-shot `maybeSingle()` fetch** in case the row already
    exists.
  - The page **ignores** rows with `confidence <= 0` (the pipeline's neutral
    fallback) so the pending screen stays up rather than flashing an empty card.

### Migration 007 (`supabase/migrations/20260529_007_ai_pipeline.sql`)

Additive, idempotent, **not auto-applied**, inert when async is off:

1. `ALTER TABLE reports ADD COLUMN IF NOT EXISTS classify_status text`
   (`null|pending|done|failed`).
2. Partial index `idx_reports_classify_status ON reports(classify_status)
   WHERE classify_status IS NOT NULL` — cheap worker dequeue over in-flight rows.
3. Guarded `ALTER PUBLICATION supabase_realtime ADD TABLE public.classifications`
   so the resident page can subscribe.

> **Serverless note.** A non-awaited promise may be frozen after the HTTP response
> returns; the fire-and-forget pipeline completes reliably only on a
> persistent/dev server. This is blessed for the demo.

---

## 7. The flag-off invariant — three guards

**When `ASYNC_CLASSIFY` is off, behavior must be byte-identical to before async
existed**, and the un-migrated database (no `classify_status` column) must not be
touched. Three guards enforce this:

1. **`markClassifyStatus` early-returns** when the flag is off — the synchronous
   path never references `classify_status`.
2. **Conditional spread on insert** (`actions.ts`):
   `...(ASYNC_CLASSIFY ? { classify_status: "pending" } : {})` — flag off → the
   insert row is bare, identical to the original.
3. **Migration 007 is not auto-applied** — so the column literally does not exist
   until an operator opts in. Any unguarded reference would break the default sync
   path on an un-migrated database, which is why guards 1 and 2 exist.

(`classify_status` is not yet in the generated Supabase types, so the async writes
cast the patch to `Record<string, unknown>`.)

---

## 8. Environment variables

| Variable                    | Where read                | Validated? | Purpose                                              |
| --------------------------- | ------------------------- | ---------- | ---------------------------------------------------- |
| `GEMINI_API_KEY`            | `lib/env.ts` `serverEnv`  | **Yes** (zod, lazy) | Gemini auth for classify + reasoning        |
| `SUPABASE_URL`              | `lib/env.ts` `serverEnv`  | **Yes**    | service-role client                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/env.ts` `serverEnv`  | **Yes**    | service-role client (RLS-bypassing writes)           |
| `NEXT_PUBLIC_SUPABASE_URL`  | `lib/env.ts` `clientEnv`  | **Yes**    | browser client                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/env.ts` `clientEnv` | **Yes**  | browser/anon client                                  |
| `INTERNAL_CLASSIFY_SECRET`  | raw `process.env` in routes | **No**   | internal-key bypass for `/api/ai/*` + Open311        |
| `NEXT_PUBLIC_ASYNC_CLASSIFY`| raw `process.env` in `config.ts` | **No** | `"1"` enables the async path (default off)       |

`serverEnv` is a lazy proxy: validation runs on first property access (request
time), so build-time route collection doesn't require secrets. A missing/invalid
**validated** var throws "Missing or invalid server environment variables: …".
`INTERNAL_CLASSIFY_SECRET` and `NEXT_PUBLIC_ASYNC_CLASSIFY` are **not** in the zod
schema — they are read raw and are not checked at startup (a missing internal
secret simply means no caller can pass the internal-key bypass).

---

## 9. Failure modes & how the demo stays unbroken

The governing invariant: **the demo must never dead-end.** Every stage degrades to
a graceful terminal state instead of throwing the user out of the flow.

### The `confidence: 0` sentinel (cross-cutting contract)

A classification with `confidence: 0` means "no real model result." It appears in
three slightly different fallback objects (the pipeline's
`category:"other"/"needs review"`, the action's `"unclassified"`, the page's
`FALLBACK_CLASSIFICATION`) and drives the UI: `SubmissionConfirmation` **hides the
AI-details card and the would-404 "Track this report" link**, and on the async path
`confidence: 0` is the signal that a result is still pending.

### Pipeline-level resilience (`classify-pipeline.ts`)

Each of these is handled (logged to `error_log` + structured logger) without
aborting more than necessary:

| Failure                          | Behavior                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| Report row not found             | log + `error_log`, stamp `failed`, return `ok:false`                  |
| Raw photo download fails/empty   | **skip Gemini**, fall through to neutral fallback (work order still created) |
| Gemini fails (network/rate/timeout) | neutral fallback classification (`model_version:"fallback"`, `raw_response:{fallback:true}`); report still reaches the staff inbox |
| `classifications` upsert fails   | log + `error_log`, stamp `failed`, return `ok:false`                 |
| `work_orders` insert fails       | log + `error_log`, stamp `failed`, return `ok:false`                 |
| `reports.status` update fails    | logged only — not fatal (classification/work order already persisted)|

On a Gemini failure the report still gets a `classifications` row and (if not
emergency) a `work_order`, then `reports.status = "dispatched"` — so a failed
classification still lands the report in the staff manual-triage queue.

### Client/action-level resilience

- **Image decode/blur fails before submit** (`page.tsx`): most commonly a HEIC the
  browser can't decode. The catch shows a recoverable error and returns to the
  preview step — it must **not** fall through to the success screen, because no
  report was created.
- **Server Action returns `!ok` or throws** (`page.tsx`): land on the thanks screen
  with `FALLBACK_CLASSIFICATION` (`confidence:0` hides the AI card) rather than
  dead-ending.
- **Sync path Gemini/pipeline failure** (`actions.ts`): caught into
  `fallbackClassification(...)`; the action still returns `ok:true` with a report id.

### Async-path backstops (two, not one)

1. **Server-side `.catch()`** in `actions.ts` around the fire-and-forget pipeline.
   The pipeline self-logs and stamps `failed` for its **handled** `ok:false`
   returns, but an **unhandled throw** (e.g. `createServerClient`,
   `photoBlob.arrayBuffer()`, `generateWorkOrder`, or a network-level throw from the
   Supabase client before any `markClassifyStatus`) would otherwise leave
   `classify_status` stuck at `pending` forever. The `.catch()` writes the throw to
   `error_log` (minting a `correlation_id`) and stamps `classify_status:"failed"`
   via the service client.
2. **Client-side timeout** in `page.tsx`: `CLASSIFY_PENDING_TIMEOUT_MS = 20000`. If
   no real classification (Realtime INSERT or the one-shot fetch) lands within the
   deadline, the pending spinner resolves to the neutral terminal state. The report
   is already persisted and sits in staff manual triage — a graceful terminal state,
   not a dead-end.

### Where to look when it fails

- **`error_log` table** — keyed by `correlation_id` and `context`
  (`"classify-pipeline"`, `"submit-report:async-classify"`), with a `message` and a
  `metadata` JSON (`reportId`, `stage`, `storagePath`, etc.).
- **Structured logger events** (`createLogger("classify-pipeline")`): `pipeline_start`,
  `photo_downloaded`, `gemini_ok`, `gemini_classify_failed_using_fallback`,
  `classification_persisted`, `pipeline_done` / `pipeline_done_emergency`.
- **Async stuck at `pending`** → check `reports.classify_status`; a `failed` stamp
  plus an `error_log` row points at the backstop. A row stuck at `pending` past
  20 s on the client means the pipeline threw before the backstop could stamp
  (rare) — the report is still in manual triage.

---

## Call contracts for off-limits modules

These are referenced by the pipeline but live outside this run's scope; documented
at the call-contract level only (internals intentionally not described):

- `generateWorkOrder(classification, { isSchoolZone: false, footTrafficWeight: 1,
  recurrenceCount: 0 })` → `{ department, crew_type, priority_score, est_minutes,
  materials }` (`lib/ai/work-order-rules`).
- `getReportCorpus()`, `CATEGORY_META`, `CATEGORY_SLA_TARGETS`
  (`lib/dashboard-data`) — the in-memory corpus + metadata the reasoning endpoint
  reads.
- `createServerClient()` (service role) / `createSSRClient()` + `getAuthUser()`
  (cookie-aware) — Supabase clients.
- `Classification`, `WorkOrder`, `Result<T>` (`lib/types`).
