# 0001: fcamera: image MIME correctness, reasoning hybrid, and scalability posture

- Status: Accepted
- Date: 2026-05-29
- Branch: `perf/dev-speed`
- Scope: the "fcamera" pipeline. Camera capture → privacy blur → upload →
  Gemini classify → work order (the citizen **Report** flow), plus the
  staff-dashboard **reasoning** API.

This ADR records four coupled decisions made while fixing the "incorrect image
parsing" bug and hardening the pipeline for load. They share one overriding
invariant, stated once below and referenced throughout.

---

## Shared context

**The bug.** A photo's bytes were mislabeled on the way to Gemini. End-to-end
trace: `privacy/blur.ts` returned the *untouched* upload (keeping its real MIME,
e.g. `image/heic` on iOS); `report/actions.ts` then **hardcoded**
`contentType: "image/jpeg"` on the raw-bucket upload and a `${id}.jpg` path
regardless of the actual bytes; `classify-pipeline.ts` finally sent those bytes
to Gemini as `"image/jpeg"`. A HEIC/PNG/WebP photo was therefore advertised as
JPEG → Gemini misparsed → silent fallback to category `other`. Secondary
defects: no EXIF-orientation normalization (`createImageBitmap` drops
orientation unless `{ imageOrientation: "from-image" }`) and no downscale (a
12 MP phone photo produces a huge base64 payload → bloated server-action body,
higher Gemini latency, higher cost).

**Two key facts shaped the fixes.** (a) Gemini natively accepts
`image/heic|heif|webp|png|jpeg`, so the correct fix is to send the *true* MIME,
not to transcode. (b) No image-processing libraries (`sharp`, `heic-convert`)
are installed, and the environment's npm install is flaky.

**The reasoning route operates on synthetic data.** `/api/ai/reasoning` reads
`getReportCorpus()`: a ~1100-row synthetic corpus with **no DB rows backing
those IDs**. Any persistence keyed on a real `reports`/`classifications` row is
therefore unavailable to it.

**Invariant (applies to every decision below): the demo must never dead-end.**
Every failure path falls back to a neutral-but-usable result so the citizen
always reaches the confirmation screen and the report always reaches the staff
inbox. The optional async path and its migration are **feature-flagged OFF by
default**, and the flag-off behavior must stay byte-identical to the prior
synchronous demo.

---

## Decision 1: Fix image MIME via client re-encode + server MIME sniff, not server transcode

### Decision

Fix the MIME bug at two layers, both dependency-free:

1. **Client-side normalization (the primary fix).** `privacy/blur.ts` decodes
   the upload with `createImageBitmap(file, { imageOrientation: "from-image" })`
   and re-encodes the result to a bounded JPEG via `bitmapToJpeg` (a helper in
   `lib/image/normalize.ts`), returning it as the `original` (the raw-bucket copy)
   instead of a raw passthrough. This bakes EXIF orientation into pixels and
   **guarantees** the bytes are real JPEG before they ever leave the device.
   Because the bytes are now genuinely JPEG, `report/actions.ts` keeps the `.jpg`
   path and `contentType: "image/jpeg"` *honestly* rather than as a lie.
2. **Server-side MIME sniff (defense-in-depth).** A new `lib/image/sniff-mime.ts`
   reads magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `GIF8`,
   WebP `RIFF…WEBP`, HEIC/HEIF `ftyp` + brand). `classify-pipeline.ts` sniffs the
   bytes downloaded from storage and passes the *detected* MIME to Gemini
   (defaulting to `image/jpeg` only when sniffing returns null).

We deliberately rejected **server-side transcoding** (e.g. `sharp` /
`heic-convert`): it would add native dependencies the flaky npm install can't be
trusted to resolve, add server CPU/latency per upload, and is unnecessary given
Gemini accepts HEIC/HEIF directly. We also rejected simply *passing through* the
original MIME without re-encoding, because that leaves the EXIF-orientation and
payload-size defects unsolved.

### Consequences

- HEIC/PNG/WebP photos now classify correctly; the silent fall-through to
  `other` for non-JPEG uploads is eliminated.
- Orientation is correct (no sideways photos) and payloads are bounded, both
  encoded blobs (blurred WebP + original JPEG) fit comfortably under Next's
  default 1 MB Server Action body limit, which previously truncated large phone
  photos into a fake-success "thanks" screen (silent data loss).
- The client re-encode means the stored raw copy is *normally* already JPEG, so
  the server sniff is **not redundant**: it protects the fallback / not-yet-
  normalized path (e.g. a raw object written by a different code path, or a
  future bypass of `normalizeImage`), and the sniffed MIME is also persisted in
  `classifications.raw_response.mime` for observability.
- Zero new runtime dependencies. All image work uses the browser canvas (client)
  and a pure byte-comparison function (server).
- Trade-off: client re-encode requires `createImageBitmap` to succeed. On a
  desktop/Android Chrome HEIC pick it can reject; that failure is caught in
  `report/page.tsx` and surfaced as a recoverable "try a JPEG/PNG or retake"
  error *before* any report is created. It is not allowed to fall through to
  the success screen (which would imply a report was saved when none was).

---

## Decision 2: Reasoning is a real-AI hybrid with an in-memory cache

### Decision

Make `/api/ai/reasoning` a **hybrid**: a real text-only Gemini call grounded in
report metadata (category, severity, status, address, age, SLA), with the
existing deterministic 5-tier templates kept as the fallback, fronted by an
**in-memory LRU cache** keyed by `reportId`. The new `lib/ai/reasoning-ai.ts`
owns three-tier sourcing for observability: `cache` → `gemini` (fresh, then
cached) → `template` (deterministic fallback on any Gemini error). Only
successful Gemini results are cached, so a transient failure never poisons a
report's cache entry. The route adds auth (a valid user session **or** the
internal-secret header) and a rate limit.

We rejected a **DB-backed cache** because the reasoning route runs on the
synthetic corpus. Those report IDs have **no row** in `reports` /
`classifications` to attach a cached narrative to, and standing up a side table
purely to memoize synthetic-demo output is unjustified overhead. We rejected
**templates-only** (loses the "real AI" demo value) and **Gemini-only** (would
dead-end the panel on any API hiccup, violating the invariant).

### Consequences

- The dashboard shows genuine, metadata-grounded AI reasoning, with instant
  warm-cache repeats for a given report (the hover/detail/delegation components
  re-request the same IDs).
- The `ReasoningResponse { reasoning, costBreakdown[], scoringExplanation[] }`
  shape is preserved exactly, three client components
  (`reasoning-hover`, `report-detail`, `delegation-row-expanded`) consume all
  three fields, so the shape is a contract.
- Cache lifetime is process-local: it resets on cold start (serverless) and is
  per-instance under multi-instance scale. Acceptable. It is a latency/cost
  optimization, not a source of truth; a miss simply re-generates.
- Bounded memory: the cache is capped (LRU eviction of the oldest entry past the
  limit), so it cannot grow without bound across the corpus.
- Zero new runtime dependencies. The cache is a plain `Map` with manual
  recency promotion; Gemini uses the already-present `@google/generative-ai`.

---

## Decision 3: Scalability: harden the sync path, add an optional flag-gated async path (default OFF)

### Decision

Protect the demo first, then make scale opt-in:

- **Harden the synchronous path** (the default and the demo path) so a single
  slow/failed dependency can't stall or break it: a per-attempt `AbortController`
  timeout and exponential-backoff-with-jitter retry on transient errors
  (`lib/ai/retry.ts`, applied to both Gemini calls); a zero-dep in-memory
  per-key rate limiter on `/api/ai/classify` and `/api/ai/reasoning`
  (`lib/ai/rate-limit.ts`), with the trusted `x-internal-key` caller
  (server actions + Open311) **exempt**; and fallback-everywhere so any
  classify failure still produces a neutral classification + work order.
- **Add an optional async path** behind `NEXT_PUBLIC_ASYNC_CLASSIFY` (default
  OFF). When ON, `submitReport` inserts the report with `classify_status:
  "pending"`, returns immediately with a neutral pending sentinel, runs the
  pipeline fire-and-forget, and the resident page subscribes to Supabase
  Realtime for the `classifications` INSERT (with a one-shot fetch to cover the
  subscribe-after-fire race and a client-side timeout backstop so the spinner
  can never hang forever). An additive migration (`…_007_ai_pipeline.sql`) adds
  the nullable `reports.classify_status` column, a partial dequeue index, and the
  Realtime publication, and is **NOT auto-applied**.

We rejected **sync-only** (doesn't address the scale ask) and **always-async**
(adds Realtime/migration complexity and latency to the happy-path demo, and risks
a serverless fire-and-forget being frozen after the response returns). Flag-gated
async is the compromise: scale when you want it, predictable demo when you don't.

### Consequences

- The default demo stays **synchronous and byte-identical** to its prior
  behavior: with the flag OFF, `submitReport` inserts the bare report row (no
  `classify_status` reference), the pipeline's `markClassifyStatus` is a hard
  no-op, and the resident page's Realtime effect is inert. This matters because
  migration 007 is not auto-applied. Any unguarded reference to
  `classify_status` would break the default path on an un-migrated database.
- Retry + timeout + rate limit make the sync path resilient to transient Gemini
  errors and abusive callers without affecting trusted internal callers.
- The async path is opt-in and self-protecting: an unexpected throw in the
  fire-and-forget pipeline is backstopped in `submitReport` (logged to
  `error_log` and `classify_status` stamped `failed`), and the client times out
  to a terminal manual-review state, so even the async path never dead-ends.
- Operational note: enabling async requires running migration 007
  (`npm run db:migrate`). Until then the column/index/publication do not exist
  and the flag must remain OFF.

---

## Decision 4: Zero new runtime dependencies

### Decision

Implement all of the above with **no new runtime dependencies**. Image
normalization uses the browser canvas; MIME sniffing is pure byte comparison;
retry/backoff, the rate limiter, and the reasoning cache are hand-written
primitives; Gemini calls reuse the already-installed legacy
`@google/generative-ai@0.24.1`. Structured output uses that SDK's
`responseMimeType: "application/json"` + `responseSchema` (verified against the
0.24.1 API), removing reliance on the fragile code-fence-stripping parse (kept
only as a belt-and-suspenders fallback).

### Consequences

- No exposure to the flaky npm install for runtime behavior; nothing new to
  audit, version, or patch.
- The hand-rolled primitives are intentionally minimal and single-purpose
  (e.g. the rate limiter is a per-instance fixed-window `Map` that resets on cold
  start). For real distributed limiting or a shared reasoning cache, swap the
  `Map` for Upstash/Redis behind the same function signature, explicitly out of
  scope for the demo.
- Test-only dev dependencies (vitest + mocks) are unaffected by this constraint;
  it governs **runtime** deps only.
