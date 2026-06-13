# Civic

AI-powered infrastructure damage reporting for residents and city governments.

Residents photograph broken infrastructure — potholes, downed trees, graffiti, water leaks — and Civic classifies it with Gemini 2.5 Flash, routes it to the right department, estimates repair cost, and gives live status updates. City staff get a prioritized work-order inbox. Managers get a real-time equity dashboard by neighborhood.

**Wedge:** Deploy in Cumming, GA as a resident-first tool. Create political pressure via public dashboard. Sell official city integration.

---

## What's Built

| Feature | Status |
|---|---|
| Photo capture + client-side face/plate blur | ✅ |
| AI classification (Gemini 2.5 Flash, structured JSON) | ✅ |
| Work order generation + department routing | ✅ |
| Staff inbox with keyboard nav | ✅ |
| Open311 GeoReport v2 API | ✅ |
| City dashboard (stats, category chart, map) | ✅ |
| Browse + filter reports | ✅ |
| Anonymous submit → upgrade to account | ✅ |
| AI reasoning endpoint (anon-accessible) | ✅ |
| Upvote persistence + triggers | 🟠 migration pending |
| Cost + SLA in staff detail | 🟠 wired, not persisted |
| Scoreboard / neighborhood equity view | 🔴 not built |
| Web push notifications | 🔴 not built |
| Offline submit (IndexedDB + Background Sync) | 🔴 not built |

---

## Tech Stack

- **Next.js 16** (App Router, RSC, Turbopack) + **React 19**
- **Supabase** — Postgres 15 + PostGIS + Auth + Storage + Realtime
- **Gemini 2.5 Flash** — structured JSON classification output
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **MapLibre GL JS** + **Deck.gl** + **Supercluster** — map + clustering
- **Zod v4** — runtime schema validation
- **Biome** — lint/format
- **Vitest** + **Playwright** — unit + e2e

---

## Local Dev

```bash
corepack pnpm install
corepack pnpm dev         # http://localhost:3000
corepack pnpm db:migrate  # apply Supabase migrations
corepack pnpm db:seed     # seed Cumming GA + test data
corepack pnpm test        # Vitest unit tests
corepack pnpm test:e2e    # Playwright e2e
```

**Required env vars** (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

Optional: `INTERNAL_CLASSIFY_SECRET`, `SENTRY_DSN`

---

## Demo Accounts

| Username | Password | Role |
|---|---|---|
| `usertest` | `usertest` | Resident |
| `admintest` | `admintest` | City admin |
| `teamtest1` | `teamtest` | Operational team |

---

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | Public | DB + Gemini connectivity check |
| `POST /api/ai/classify` | Session or internal key | Trigger/retry classification |
| `GET /api/ai/reasoning` | Public | Explain a classification |
| `GET /api/open311/v2/services` | Public | Report categories (Open311) |
| `GET /api/open311/v2/requests` | Public | List/filter reports (GeoReport v2) |
| `GET /api/open311/v2/requests/[id]` | Public | Single report (Open311) |

---

## Data Model

Core tables: `cities`, `users`, `reports`, `classifications`, `work_orders`, `assets`, `verifications`, `audit_log`

Report categories: `pothole · streetlight · downed_sign · graffiti · illegal_dump · water_leak · sidewalk_damage · tree_down · debris · drainage · faded_signage · other`

Report statuses: `open → dispatched → in_progress → closed` (also `merged`, `rejected`)

---

## AI Classification Pipeline

1. Resident submits photo → stored in `photos-raw` bucket (unblurred, private)
2. Blurred copy stored in `photos-public` bucket
3. Gemini 2.5 Flash classifies raw image → structured JSON (category, severity 1–5, confidence, hazard radius, cost estimate)
4. Classification persisted + work order auto-generated with department routing
5. If Gemini fails → report queued for manual triage (confidence = 0), no crash

---

## Architecture Notes

- All AI calls server-side only — never from client
- RLS default-deny on every table; service-role key never exposed to browser
- No PII in URLs or query strings
- Geo queries via PostGIS (`ST_DWithin`), not haversine
- Server actions for mutations; route handlers for external API calls
- `photos-raw` accessible only to staff + service role; `photos-public` CDN-accessible

---

## Competitive Position

| | Civic | SeeClickFix | Tyler 311 | Granicus |
|---|---|---|---|---|
| Resident UX | Sub-10s submit | Clunky form | Portal | Portal |
| AI classification | ✅ Gemini 2.5 | ❌ | ❌ | ❌ |
| Public equity dashboard | ✅ | Partial | ❌ | ❌ |
| Open311 | ✅ | ✅ | ✅ | Partial |
| Deploy without city buy-in | ✅ | ❌ | ❌ | ❌ |
