# src/

Application source. Three top-level concerns, each documented in its own README:

| Directory | Owns | README |
| --- | --- | --- |
| `app/` | Routes, layouts, API endpoints, server actions | [`app/README.md`](./app/README.md) |
| `components/` | UI, 153 files across 23 groups | [`components/README.md`](./components/README.md) |
| `lib/` | Everything testable without React | [`lib/README.md`](./lib/README.md) |

Plus `test/`, which holds one file: `server-only-stub.ts`, aliased in
`vitest.config.ts` so server modules can be imported under a node test
environment.

## The dependency direction

```
app/  ──imports──▶  components/  ──imports──▶  lib/
  │                                              ▲
  └──────────────────imports─────────────────────┘
```

`lib/` imports nothing from `app/` or `components/`. That is what makes it unit
testable, and it is the constraint most worth defending: a helper that reaches
back into a route or a component has stopped being a helper.

The one live exception is `app/staff/*-actions.ts`, which components import for
mutations. It reads backwards, and it is deliberate. Server actions have to be
declared in the `app/` tree. See `app/README.md` before touching that directory;
the `/staff` route UI is scrapped but the action modules are load-bearing.

## Conventions that apply across all three

- **Server components by default.** `"use client"` only where interactivity
  requires it, and pushed down to the interactive leaf rather than declared at
  the top of a page.
- **Mutations are server actions** returning `{ ok: true, data } | { ok: false, error }`.
  An HTTP route is for things called from outside, AI endpoints, webhooks,
  Open311.
- **Tests co-locate** as `foo.test.ts` beside `foo.ts`. 129 unit files do this;
  only database-level and corpus-level suites live under `tests/`.
- **No `any`** without a one-line comment saying why.
- **`@/` is the alias for `src/`.** Deep relative imports (`../../../lib/...`)
  should be rewritten.
- One concern per file.

## Non-negotiables

These come from `agents.md` and are not local style preferences:

1. Gemini is never called from the client. All model calls go through `/api/ai/*`.
2. Faces and plates are blurred client-side before upload. No raw photo reaches
   the public bucket.
3. RLS on every table, default deny.
4. No PII in URLs or query strings.
5. Open311 GeoReport v2 compatibility is required, not optional.
6. Anything in `NEXT_PUBLIC_*` reaches the browser and must be safe to expose.
7. Geo queries use PostGIS `ST_DWithin`, never haversine in application code.
8. `lib/open311/`, `lib/privacy/blur.ts` and `supabase/migrations/` are
   spec-critical. Changes there need an explicit ask.

## Checks

```bash
pnpm typecheck    # tsc --noEmit, strict
pnpm lint         # biome check src/
pnpm test         # vitest, 129 unit files
```

Biome is scoped to this directory, so lint says nothing about `scripts/`,
`e2e/`, or the seed files.
