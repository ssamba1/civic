# AGENTS.md

> This is the cross-tool agent instruction file (Codex, Cursor, Copilot, Amp, Jules, Factory). For Claude Code, symlink: `ln -s AGENTS.md CLAUDE.md`. Full product and design context lives in `docs/CONTEXT.md` and `docs/DESIGN.md`. Read those before any substantive work. Keep this file short.

## What this is

Civic. AI-native citizen repair reporting. Residents photograph broken infrastructure, AI classifies and generates a work order, staff dispatch, public dashboard creates accountability pressure. Open311 GeoReport v2 compatible. Pilot in Cumming, Georgia.

## Commands

```bash
pnpm install                    # install deps
pnpm dev                        # local dev on :3000
pnpm test                       # vitest unit tests
pnpm test:e2e                   # playwright e2e
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # biome check
pnpm db:migrate                 # supabase migration up
pnpm db:seed                    # seed Cumming + test data
pnpm health                     # curl /health, confirms db + gemini
```

## Stack

- Next.js 15 (App Router), TypeScript strict, React Server Components by default
- Supabase: Postgres 15 + PostGIS, Auth, Storage, Realtime
- Tailwind CSS + shadcn/ui (Radix primitives)
- Mapbox GL JS v3
- Gemini 2.5 Flash (vision + classification), embeddings for dedup
- Vercel edge runtime where possible, Node runtime when libraries force it
- Biome for lint/format, Vitest for unit, Playwright for e2e

## Hard rules

1. **Never call Gemini from the client.** All AI calls go through `/api/ai/*` server routes.
2. **Privacy blur is mandatory.** Faces and license plates blurred client-side before upload. No raw photo ever goes to the public bucket. Two buckets: `photos-public` (blurred, permanent) and `photos-raw` (original, 30 day TTL, restricted RLS).
3. **RLS on every table.** Default deny. Tests in `tests/rls/` must pass before merging schema changes.
4. **No PII in URLs or query strings.** Ever.
5. **Open311 compatibility is non-negotiable.** Every report must be exportable in Open311 GeoReport v2 XML and JSON. See `lib/open311/`.
6. **No secrets in client env.** Anything in `NEXT_PUBLIC_*` must be safe to expose.
7. **Geo queries use PostGIS.** `ST_DWithin`, not haversine math in app code.
8. **No `any` types** without a one-line comment explaining why.
9. **Server actions for mutations** unless the route needs to be called externally (AI endpoint, webhooks, Open311 API).
10. **Never modify** `lib/open311/`, `lib/privacy/blur.ts`, or anything under `supabase/migrations/` without explicit ask. These are spec-critical.

## Code style

- Server components by default. Add `"use client"` only when interactivity requires it.
- Folder layout: `app/` (routes), `components/` (UI), `lib/db/` (queries), `lib/ai/` (model calls), `lib/privacy/` (blur), `lib/open311/` (API conformance).
- One concern per file. Co-locate tests as `Foo.test.ts` next to `Foo.ts`.
- All time as `timestamptz`. All locations as `geography(POINT, 4326)`.
- Errors: return tagged result objects `{ ok: true, data } | { ok: false, error }` from server actions. Throw only in unreachable code.

### Example patterns to follow

Server action returning a tagged result:
```ts
"use server";
export async function submitReport(input: ReportInput): Promise<Result<{ id: string }>> {
  const parsed = ReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  // ...
  return { ok: true, data: { id: row.id } };
}
```

Geo dedup query:
```ts
const candidates = await sql`
  SELECT id FROM reports
  WHERE status = 'open'
    AND ST_DWithin(location, ST_MakePoint(${lng}, ${lat})::geography, 50)
    AND created_at > now() - interval '30 days'
`;
```

## When to stop and ask

- Adding a new npm dependency
- Changing the data model in any way
- Touching Open311, privacy, or migrations directories
- Anything that would expose raw photos publicly
- Anything that would call an AI model from the client
- Building features not listed in DESIGN.md's MVP scope

## Definition of done (any task)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass
- [ ] RLS tests pass for any table touched
- [ ] No raw photos in `photos-public` bucket (audit script: `pnpm audit:privacy`)
- [ ] Lighthouse on `/city/cumming`: Perf > 90, A11y > 95, SEO > 95
- [ ] Manual end-to-end on a real phone, not just localhost

## What lives where

- `docs/CONTEXT.md` - problem, market, GTM, personas, business model
- `docs/DESIGN.md` - architecture, data model, AI pipeline, alternatives considered
- `docs/decisions/` - ADRs for any architecture choice that closed off alternatives
- `docs/runbooks/` - on-call procedures (deploys, incidents, rollbacks)
- `tests/rls/` - row-level security regression tests
- `tests/golden/` - sample photos + expected classifications

Read the doc before the code. If `docs/DESIGN.md` and this file conflict, the design doc wins. Flag the conflict.

## Pitfalls specific to this project

- Browser geolocation is unreliable in some Android builds. Always have a manual address fallback.
- Mapbox marker clustering breaks with >5k points. Use the supercluster lib at the data layer.
- Gemini occasionally returns markdown-wrapped JSON despite the prompt. Always strip code fences before parsing.
- iOS PWA cannot keep camera permission across sessions reliably. Web Share Target API is the workaround.
- PostGIS `geography` is more expensive than `geometry` but handles antimeridian correctly. We use `geography`. Do not change this.
- Supabase Realtime has a soft cap of about 200 concurrent subscribers per channel. Shard by city beyond that.