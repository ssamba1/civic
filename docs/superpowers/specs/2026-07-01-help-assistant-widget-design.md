# Help Assistant Widget — Design

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Branch:** `civic-ahilyanagar`

## Summary

A floating, help-first AI assistant in the bottom-right of every page. It answers
help/FAQ questions, looks up the current user's own live data (report status, city
stats), and opens the right screen for the user. It is **read + navigate only** — it
performs no data mutations in this MVP. Retrieval is lightweight (no pgvector). The
chat engine is built on the Vercel AI SDK (`ai` + `@ai-sdk/google`) reusing the
existing Gemini integration, called strictly server-side.

## Motivation and the anti-goal it must respect

`docs/planning/context.md` lists **"Resident chatbot for general questions"** as an
explicit anti-goal, with the test: *does this help a resident report something broken
faster, or help the city fix it faster?* This feature is deliberately scoped as a
**task-completing help assistant**, not a general-purpose chatbot:

- It answers questions about **how Civic works** (privacy, blur, Open311, cost, SLA)
  and about **the user's own reports/data** — both of which reduce friction in the
  core report → track → fix loop.
- It **navigates** users to the right screen instead of making them hunt.
- It is surfaced and labelled as **"Help"/"Ask"**, never "Chatbot", to stay in
  product voice ("never lead with the AI").
- It explicitly refuses open-ended civic advice and off-topic conversation.

This is an intentional, owner-approved narrowing of the anti-goal, not an override of
the product's focus.

## Scope

### In scope (MVP)
- Floating assistant widget, bottom-right, on all pages, streaming responses.
- Answer help/FAQ from a curated in-app corpus.
- Read the current user's RLS-scoped live data (their reports + status; staff: nothing
  extra in MVP unless the staff read-tier is enabled — see Deferred).
- Read public city stats (dashboard view).
- Open screens for the user via validated client-side navigation.
- Role-aware behaviour driven entirely by Postgres RLS (resident / staff / anon).

### Out of scope (MVP)
- **No writes / no data input**: no submitting reports, upvoting, CSAT, dispatch,
  comments, or edits. (Originally requested; deliberately deferred after tradeoff
  review — see Deferred.)
- **No pgvector / vector DB.** The corpus needing semantic search today is ~7 FAQ
  items plus a few doc sections.
- No cross-user data access (RLS forbids it by construction).
- No conversation persistence across sessions.
- No new AI provider — reuse Gemini.

## Hard constraints inherited from the codebase

These come from `AGENTS.md` and the RLS model; the design must not violate them.

1. **Gemini is never called from the client.** All model calls go through a server
   route (`/api/ai/chat`), mirroring `/api/ai/classify`.
2. **RLS is the security boundary.** Every data-read tool queries with the *user's own*
   SSR-authenticated Supabase client (request cookies/session), **never the
   service-role key**. RLS then scopes rows automatically and correctly per role.
3. **No PII in URLs.** The `navigateTo` tool validates targets against a route
   allow-list and never places PII in query strings.
4. **No new data model changes for MVP.** No migrations; the help corpus is static.
5. **Adding npm dependencies is a stop-and-ask** — answered: the Vercel AI SDK base
   is approved.

## Architecture

```
Widget (client component, useChat from @ai-sdk/react)
   │  POST /api/ai/chat   (browser sends session cookies)
   ▼
/api/ai/chat  (server route, Node runtime)
   │  1. getAuthUser()  → user's RLS-scoped Supabase client + { role, city_id }
   │  2. rate-limit (reuse existing limiter)
   │  3. streamText({ model: google('gemini-2.5-flash'), system, tools, messages })
   ▼
Tool loop (all READ / NAVIGATE — no writes):
   searchHelpDocs · getMyReports · getReportStatus · getCityStats · navigateTo
   │  data tools run queries AS THE USER (RLS enforced), return compact JSON
   ▼
Stream tokens + tool events → widget renders markdown; a navigateTo tool
result triggers router.push() on the client.
```

Reused building blocks: `getAuthUser()` (auth + scoped client), `withRetry`
(`src/lib/ai/retry.ts`), the Gemini rate limiter (`src/lib/ai/rate-limiter.ts`),
tagged-result error style, and `error_log` on failure.

### Components / units (each independently testable)

- **`src/lib/ai/help-corpus.ts`** — typed array of `{ id, title, tags, body }` help
  snippets seeded from the FAQ + doc sections. One concern: hold the corpus.
- **`src/lib/ai/chat/retrieval.ts`** — `searchCorpus(query, k)`: keyword/lexical
  scoring (token overlap / BM25-lite) returning top-k snippets. Pure, no I/O.
- **`src/lib/ai/chat/tools.ts`** — factory `buildChatTools(ctx)` where `ctx` holds the
  user's scoped Supabase client + role/city. Returns the AI SDK tool set. Data tools
  never receive the service-role client.
- **`src/lib/ai/chat/system-prompt.ts`** — builds the system prompt from role +
  city + the tool contract + refusal rules.
- **`src/app/api/ai/chat/route.ts`** — the streaming endpoint; wires auth →
  rate-limit → `streamText` → response.
- **`src/components/assistant/*`** — the widget: launcher button, panel
  (`Drawer`/`BottomSheet`), message list, composer. Client component.
- **`src/lib/ai/config.ts`** (edit) — add `CHAT_MODEL` and a `HELP_ASSISTANT` flag.
- **`src/app/layout.tsx`** (edit) — mount the widget via portal.

## Tool set (read + navigate only)

| Tool | Input | Returns | Scope / enforcement |
|---|---|---|---|
| `searchHelpDocs` | `{ query }` | top-k help snippets | static corpus, no auth needed |
| `getMyReports` | `{ status? }` | reports the caller authored + status | RLS: `reporter_id = auth.uid()` (both roles) |
| `getReportStatus` | `{ idOrToken }` | one report timeline | RLS row check, or public `/r/[token]` |
| `getCityStats` | `{ slug }` | public dashboard KPIs | `dashboard_reports_view` (public) |
| `navigateTo` | `{ route }` | ack | route allow-list; client `router.push` |

`navigateTo` allow-list (validated server-side before returning to client): `/`,
`/report`, `/user/my-reports`, `/user/my-reports/[id]` (id from a report the user can
see), `/user/pulse`, `/user/updates`, `/city/[slug]`, `/city/[slug]/map`,
`/city/[slug]/analytics`, `/r/[token]`, `/login`, and staff routes only when
`role` is staff.

## Retrieval design (lightweight, upgrade-ready)

- Corpus = 7 existing FAQ items (`src/components/landing/faq.tsx`) + curated snippets
  distilled from `context.md` / `design.md` (privacy/blur, Open311 interop, AI
  mechanics + cost, SLA/accountability, cities live).
- Retrieval is in-process lexical top-k. No embeddings, no DB, no migration.
- **Upgrade path (documented, not built):** when the corpus passes ~50–100 chunks or
  needs semantic recall, add pgvector — which is already roadmapped for dedup — and
  swap `searchCorpus` for a vector query behind the same interface. `retrieval.ts` is
  the single seam.

## Widget UI

- Collapsed: small launcher bubble/pill, bottom-right.
- Expanded: panel via existing `Drawer` (desktop) / `BottomSheet` (mobile), using
  `LiquidGlassCard`, `Button`, Hanken Grotesk, dark theme.
- Mount: `createPortal(widget, document.body)` as a sibling to `BottomTabBar`,
  `z-50` (above the `z-40` tab bar), honouring `env(safe-area-inset-bottom)` so it
  clears the mobile tab bar.
- Motion respects `prefers-reduced-motion`.
- Streaming markdown rendering; tool activity shown as subtle inline status.
- Label: **"Help"** / **"Ask Civic"** — not "Chatbot".

## Error handling

- Route returns a tagged result / proper HTTP status; unauth → 401, rate-limited →
  429, model failure → graceful streamed apology + `error_log` write. Never crashes
  the page (matches the "demo thread never breaks" ethos).
- Tool failures are caught and returned to the model as a structured error so it can
  recover conversationally rather than throwing.
- Client widget degrades to a static "Help" link list if `/api/ai/chat` is
  unreachable.

## Security & guardrails

- **RLS as backstop:** data tools use the user's scoped client → prompt injection in a
  report's free-text description can never exceed the caller's own access.
- **No writes** → minimal attack surface.
- **`navigateTo`** validated against the allow-list; no open redirect, no PII in URLs.
- **Gemini server-only**, system prompt constrains to Civic help + user data and
  refuses off-topic / general civic advice.
- **Rate-limited** via the existing limiter; internal-key bypass not exposed to the
  widget.
- **Demo mode** (cookie persona, not a security boundary): scope to the persona's
  city + role, read-only; no service-role cross-user access.

## Dependencies

Add (approved): `ai`, `@ai-sdk/google`, and a chat UI shell (`@assistant-ui/react`
or shadcn chat — the lighter fit chosen at plan time via context7). Classification
stays on `@google/generative-ai`; the two SDKs coexist by design (chat vs. vision
pipeline), an accepted tradeoff.

## Model choice

- Chat: `gemini-2.5-flash` (stronger tool-calling than flash-lite).
- Classification pipeline: unchanged (`gemini-2.5-flash-lite`).
- Both configurable in `config.ts`.

## Deferred (Phase 2 — architecture already supports)

- **Submit-assist & staff write tools** behind a confirm/preview step, routed through
  the *existing* server actions (`submitReport`, `dispatchWorkOrder`, …) so validation
  + RLS + `audit_log` are reused. This is the "input data" capability from the
  original request.
- **pgvector semantic help** (swap behind `retrieval.ts`).
- **Conversation persistence** (new table + RLS) for history across sessions.

## Testing & Definition of Done

- Vitest: `retrieval.ts` scoring; each data tool asserts RLS scoping per role
  (a resident cannot read another user's report *through the bot*); `navigateTo`
  allow-list rejects unlisted / staff-only routes for residents.
- Route test: unauth → 401, rate-limit path, streamed shape.
- Playwright e2e: open widget → ask a help question → ask "take me to my reports" →
  assert navigation.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` green; RLS tests still pass (no schema
  change, but tools must not regress scoping).

## Open items to confirm at plan time (non-blocking)

- Exact chat UI shell (`@assistant-ui/react` vs. shadcn chat) — decide via context7.
- Whether MVP surfaces the staff read-tier tool (`queryWorkOrders`) or truly
  resident-only reads first.
