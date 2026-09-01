# fcamera: Camera → AI Image-Parsing Pipeline: Scalability + Correctness Plan

Date: 2026-05-29 · Branch: `perf/dev-speed`

"fcamera" = the camera-capture → privacy-blur → upload → Gemini-classify → work-order
pipeline behind the citizen **Report** flow, plus the staff-dashboard **reasoning** API.

---

## Verified root cause (the "incorrect image parsing" bug)

End-to-end byte trace:

1. `lib/privacy/blur.ts:156`: `original = new Blob([raw bytes], { type: imageFile.type })`.
   The original is the **untouched** upload, keeping its real MIME (e.g. `image/heic` on iOS).
2. `app/report/actions.ts:117`: raw-bucket upload **hardcodes** `contentType: "image/jpeg"`
   and path `${id}.jpg`, regardless of the actual bytes.
3. `lib/ai/classify-pipeline.ts:69`: sends those bytes to Gemini as `"image/jpeg"`.

A HEIC/PNG/WebP photo is therefore **mislabeled JPEG** → Gemini misparses → silent fallback
to category `other`. Secondary: no EXIF-orientation normalization (`createImageBitmap` drops
orientation unless `{ imageOrientation: "from-image" }`), no downscale (12 MP phone photo →
huge base64 → server-action payload + Gemini latency + cost).

Dead code: `lib/privacy/upload.ts` (`uploadReportPhotos`) preserves `original.type` correctly
but is **not** the live path. The server action `submitReport` does the uploads.

Gemini natively accepts `image/heic|heif|webp|png|jpeg`, so the fix is to send the **correct**
MIME, not to transcode on the server (no `sharp`/`heic` libs installed).

---

## Scope (confirmed with user)

- **Scalability:** harden the sync pipeline **AND** add an optional async path (feature-flagged,
  default OFF so the demo stays synchronous).
- **Reasoning route:** hybrid, real Gemini reasoning, **in-memory LRU cache** (not a DB row: the
  route operates on the 1100-row *synthetic* corpus with no DB backing), template fallback, + auth.
- **Branch:** work directly on `perf/dev-speed`.

Invariant preserved throughout: **the demo never dead-ends** (fallback classification on any failure).

---

## Workstreams

### WS1: Image parsing correctness (coupled backend chain, edit sequentially)
- New `lib/image/normalize.ts`: client-side `createImageBitmap(file,{imageOrientation:"from-image"})`
  → canvas → `toBlob("image/jpeg", q)` with max-dimension downscale (~1600px long edge). Bakes
  orientation, guarantees JPEG bytes, shrinks payload.
- New `lib/image/sniff-mime.ts`: magic-byte sniff (JPEG `FFD8`, PNG `89504E47`, WebP `RIFF…WEBP`,
  HEIC/HEIF `ftyp`). Server-side defense-in-depth.
- `blur.ts`: build the blurred copy from an orientation-corrected bitmap; return a **normalized**
  original (JPEG) instead of raw passthrough.
- `report/page.tsx`: run normalize before/within the blur+upload step.
- `actions.ts`: derive raw-bucket `contentType` from the normalized output (now real JPEG); stop
  hardcoding. Keep `.jpg` path (bytes now truly JPEG).
- `classify-pipeline.ts:69`: sniff stored bytes → pass the **correct** MIME to Gemini.

### WS2: Gemini robustness (`lib/ai/gemini.ts`, `classification-schema.ts`, `classify-pipeline.ts`)
- Structured output: `generationConfig.responseMimeType="application/json"` + `responseSchema`
  (SchemaType form, mirrors `classificationSchema`). Removes the fragile `stripCodeFences` path
  (keep it as a fallback). **Verify exact API via context7 for `@google/generative-ai@0.24.1`.**
- Zero-dep retry+backoff (`lib/ai/retry.ts`) on transient errors (429/5xx/network).
- `AbortController` timeout (requestOptions) so a hung call can't stall the server action.
- New `lib/ai/config.ts`: single source for model id, timeout, retry, feature flags.
- Fix `raw_response`: store the **actual raw model text**, not the parsed object.

### WS3: Reasoning hybrid (`api/ai/reasoning/route.ts`, new `lib/ai/reasoning-ai.ts`)
- Generate cost/scoring narrative via a **text-only** Gemini call grounded in report metadata
  (category, severity, SLA, age, status). Keep existing 5-tier templates as the fallback.
- In-memory LRU cache keyed by `reportId` (synthetic IDs have no DB row).
- Add auth (route is currently unauthenticated) + rate limit. Preserve the
  `ReasoningResponse {reasoning, costBreakdown[], scoringExplanation[]}` shape, 3 client
  components consume all three fields (`reasoning-hover`, `report-detail`, `delegation-row-expanded`).

### WS4: Scalability (rate limit + async)
- New `lib/ai/rate-limit.ts`: zero-dep in-memory per-IP token bucket. Apply to `/api/ai/classify`
  and `/api/ai/reasoning`. **Exempt the `x-internal-key`** (server-action + Open311 callers).
- Async path (feature-flagged `NEXT_PUBLIC_ASYNC_CLASSIFY`, default OFF): insert report with a
  pending classify status, return fast, classify in background, client subscribes via Supabase
  Realtime (CSP already allows `wss://*.supabase.co`). Additive migration `…_007_ai_pipeline.sql`
  adds a nullable `reports.classify_status` column, **written but NOT auto-applied**.

### WS5: Tests (NEW, none exist today; new files only, safe to parallelize)
- `vitest.setup.ts` + mocks for `@google/generative-ai` and supabase.
- Unit tests: normalize, sniff-mime, retry, rate-limit, gemini structured-output parse,
  reasoning-ai cache+fallback, work-order rules, classify-pipeline fallback paths.

### WS6: Documentation
- `docs/runbooks/ai-pipeline.md`: architecture, the byte path, env flags, failure modes.
- `docs/decisions/`: ADR for the image-MIME fix + reasoning-hybrid + async flag.
- Change summary appended here.

---

## Execution model (waves: mutators sequenced along the coupled chain)

1. Foundation (new files only): config, image utils, retry, rate-limit, reasoning-ai, migration.
2. Core chain (sequential, one coherent edit): gemini → schema → pipeline → blur → page → actions.
   **tsc gate** before proceeding.
3. Routes (sequential): classify route + reasoning route (rate limit, auth, hybrid wiring).
4. Async (sequential, flag-gated): actions + page + classify route + migration.
5. Tests (parallel, disjoint new files).
6. Verify (parallel/read-only): `tsc --noEmit`, `biome check src/`, `vitest run`, best-effort build;
   adversarial per-fix tracing.
7. Review (parallel, multi-lens): correctness, security, perf/scale, type-design, silent-failure,
   demo-invariant, image-pipeline. Findings adversarially verified before fixing.
8. Fix confirmed findings (sequential).
9. Document (parallel).
10. Completeness critic.

## Risks / guardrails
- Coupled chain → never run parallel mutators on the same file; sequence WS1/WS2 together.
- Live demo → preserve fallback-everywhere; async + migration stay OFF by default.
- Gemini SDK is legacy `@google/generative-ai@0.24.1` (not `@google/genai`), verify API via context7.
- Windows paths contain spaces, quote in all shell commands.

---

## Change Summary

ADR for these decisions: `docs/decisions/0001-fcamera-image-mime-and-reasoning.md`.

### Files added

- `src/lib/ai/config.ts`: single source for model id, timeout, retry, rate-limit, async flag.
- `src/lib/ai/retry.ts`: zero-dep exponential-backoff retry + per-attempt `AbortController` timeout.
- `src/lib/ai/rate-limit.ts`: zero-dep in-memory fixed-window per-key limiter + `clientIp()`.
- `src/lib/ai/reasoning-ai.ts`: text-only Gemini reasoning, structured output, in-memory LRU cache, three-tier sourcing (cache → gemini → template).
- `src/lib/image/normalize.ts`: client-side `createImageBitmap` (orientation-baked) → canvas → bounded JPEG.
- `src/lib/image/sniff-mime.ts`: pure magic-byte MIME sniff (JPEG/PNG/GIF/WebP/HEIC-HEIF).
- `supabase/migrations/20260529_007_ai_pipeline.sql`: additive, idempotent, **NOT auto-applied**: nullable `reports.classify_status`, partial dequeue index, Realtime publication for `classifications`.
- Tests (8, all run under the `node` vitest environment, no jsdom/canvas): `src/lib/ai/classification-schema.test.ts`, `src/lib/ai/classify-pipeline.test.ts`, `src/lib/ai/gemini.test.ts`, `src/lib/ai/rate-limit.test.ts`, `src/lib/ai/reasoning-ai.test.ts`, `src/lib/ai/retry.test.ts`, `src/lib/ai/work-order-rules.test.ts`, `src/lib/image/sniff-mime.test.ts`.

### Files changed

- `src/lib/ai/gemini.ts`: structured output (`responseMimeType` + `responseSchema`), retry+timeout wrap, persist actual raw model text; `stripCodeFences` kept only as fallback.
- `src/lib/ai/classification-schema.ts`: added `GEMINI_CLASSIFICATION_SCHEMA` (SchemaType) mirroring the zod schema.
- `src/lib/ai/classify-pipeline.ts`: sniff stored bytes → pass true MIME to Gemini; persist sniffed mime in `raw_response`; flag-gated no-op `markClassifyStatus`; fallback-everywhere preserved.
- `src/lib/privacy/blur.ts`: return a normalized (orientation-baked, bounded) JPEG `original` instead of raw passthrough; bounded encodes fit the 1 MB Server Action limit.
- `src/app/api/ai/classify/route.ts`: auth (session or `x-internal-key`), rate limit (internal exempt), object-level authz via RLS-scoped read.
- `src/app/api/ai/reasoning/route.ts`: auth + rate limit; hybrid sourcing via `getReasoning` with the 5-tier template as fallback; `ReasoningResponse` shape preserved.
- `src/app/report/actions.ts`: honest raw `contentType` (real JPEG now); flag-gated async fire-and-forget path with backstop logging; flag-off insert byte-identical to before.
- `src/app/report/page.tsx`: run normalize within blur+upload; flag-gated Realtime subscription + one-shot fetch + timeout backstop for the async path; pre-submit decode failure surfaces a recoverable error (no fake success).

### Out of scope / excluded from this summary

`git status` also shows modifications to files owned by the concurrent dev-perf
process, `next.config.ts`, `src/proxy.ts`, `src/lib/dashboard-queries.ts`,
`src/app/city/[slug]/page.tsx`, `src/components/report/camera-capture.tsx`,
`vitest.config.ts`. These are **not** part of the fcamera work and are excluded.

### Verification results

- **tests. GREEN.** `npx vitest run` → **8 files, 93/93 passed** (node environment, no jsdom). The one fully clean gate.
- **typecheck (production sources clean; test-glue red (off-limits config).** `npx tsc --noEmit` exits 1 with 362 errors, **all in newly-added `.test.ts` files** and **100% from vitest globals** (`describe`/`it`/`expect`, codes TS2582/TS2304) not declared in `tsconfig.json`'s `types`. A `grep -vE '\.test\.ts'` over the error list returns **empty**) zero typecheck errors in any production source (in-scope or otherwise). `tsconfig.json` is off-limits (concurrent process owns it), so adding `"vitest/globals"`/`"node"` to its `types` is the correct fix and is left to that owner; vitest itself resolves the globals at runtime (hence 93/93 green).
- **lint, production in-scope clean (one style nit); repo-wide pre-existing noise.** `npx biome check src/` exits 1 with 306 errors / 55 warnings, **dominated by pre-existing repo-wide cosmetics** (158 `format`, 84 `assist/source/organizeImports`) in off-limits/unrelated files. The only in-scope **production**-source diagnostic is one `lint/style/useTemplate` nit at `src/app/api/ai/classify/route.ts:26` (`"classify:" + clientIp(...)`); in-scope test files carry only `organizeImports`/`format`/`noThenProperty` cosmetics. Reported, not auto-fixed (documentation task).
- **build. Not run; production-typecheck used as proxy.** Full `next build` was **not** executed: the concurrent dev-perf process owns a live dev server (port 3000) and `next.config.ts`, so a build would contend on `.next/` and disrupt that owner. `next.config.ts` does not set `typescript.ignoreBuildErrors`, so `next build`'s type-check step would also fail on the same test-file vitest-globals errors above (a config gap, not in-scope code). The clean production-source `tsc` result stands in as the build-type proxy; the plan likewise scoped build as "best-effort" (Execution model step 6).
