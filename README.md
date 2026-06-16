# Civic

> AI-powered infrastructure reporting that gets potholes fixed — not just filed.

Residents photograph broken infrastructure. Civic classifies it with Gemini 2.5 Flash, routes it to the right city crew, estimates repair cost, and delivers live status updates. City staff get a prioritized work-order inbox. Managers get a real-time equity dashboard by neighborhood. No city buy-in required to launch.

---

## What is it?

Civic is a full-stack municipal infrastructure platform with two audiences:

**Residents** — photograph a problem (pothole, downed tree, water leak, graffiti) in under 10 seconds. No account needed. Get a public tracking link and email updates as the report moves from open → dispatched → in progress → resolved.

**City staff** — receive a keyboard-navigable work-order inbox with AI-generated priority scores, crew assignments, cost estimates, and before/after evidence. Analytics surface neighborhood equity gaps, SLA risk, and category trends in real time.

---

## Features

### Resident Experience
- **Sub-10s photo submit** — camera capture, optional description, anonymous by default
- **On-device privacy blur** — faces and license plates detected and blurred before upload (ONNX runtime, never leaves device)
- **Public status tracking** — tokenized `/r/[token]` link, no account required
- **Account upgrade** — link an email later; anonymous session merges into your account
- **Community pulse** — city-wide fix rate, morale metrics, neighborhood improvement trends
- **Upvote reports** — back issues your neighbors already filed
- **Email notifications** — status change emails via Resend (open → dispatched → closed)
- **CSAT + before/after** — rate resolution quality, view crew's closing photo

### AI Classification Pipeline
- **Gemini 2.5 Flash** classifies the unblurred raw photo (not the public copy) with structured JSON output
- Outputs: category, subcategory, severity (1–5), confidence (0–1), hazard radius, visible size estimate, emergency flag, 2–3 sentence reasoning
- **Work order auto-generated** — department, crew type, estimated time, materials, cost estimate, AI rationale
- **Duplicate detection** — geo radius + same category + time window → merge into primary, escalate priority, exclude from public counts
- **Async mode** — optional `NEXT_PUBLIC_ASYNC_CLASSIFY=1` defers classification to a background job with Realtime subscription
- **Graceful fallback** — if Gemini fails, report is queued for manual triage (confidence = 0), pipeline never crashes

### Staff & Operations
- **Work-order inbox** — keyboard navigable (`j/k` or arrows, `d` to dispatch), sortable by priority score
- **Realtime comments** — internal crew notes sync live across all staff sessions
- **Fullscreen operational map** — clustered pins, heatmap and hex-bin views, team filter, status filter, dispatch panel
- **Detailed work order view** — AI rationale, cost breakdown, photo evidence, assignment, timeline
- **Duplicate-aware priority** — merged reports escalate the primary work order's score

### Analytics & Equity
- **City dashboard** — total/open/resolved KPIs, category breakdown, recent activity
- **Analytics bento** — resolution rate, MTTR, SLA compliance, peak hours, per-category performance
- **Neighborhood equity view** — per-neighborhood resolution rates surfacing underserved areas
- **Team dashboards** — per-team workload, delegation history, routing matrix, roster

### Platform & Integrations
- **Open311 GeoReport v2** — full GET + POST compliance (JSON + XML), external clients can push reports
- **12 operational teams** — Streets, Sidewalks, Stormwater, Utilities, Lighting, Traffic, Parks, Graffiti, Code Enforcement, Environmental, and more
- **Routing matrix** — customizable category → team mapping, override per-report, full delegation history
- **CSP + HSTS + security headers** — nonce-based CSP per request, HSTS preload, X-Frame-Options DENY
- **RLS default-deny** — every table requires an explicit grant; service-role key never reaches the browser

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, RSC, Turbopack) + React 19 |
| Database | Supabase — Postgres 15 + PostGIS + Auth + Storage + Realtime |
| AI | Gemini 2.5 Flash (`@google/generative-ai` v0.24) |
| Maps | MapLibre GL JS v5 + React Map GL + Deck.gl (scatter, hex, heatmap) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Validation | Zod v4 (runtime schema validation, server env guard) |
| Animations | Framer Motion + GSAP |
| Privacy | ONNX Runtime Web (on-device face/plate detection) |
| Email | Resend |
| Error tracking | Sentry |
| Lint / Format | Biome |
| Testing | Vitest (unit) + Playwright (e2e) |

---

## Routes

### Public
| Route | Description |
|---|---|
| `/` | Landing page — animated hero, globe, city search |
| `/city/[slug]` | City dashboard — stats, map, team overview |
| `/city/[slug]/browse` | Browse and filter all reports, upvote |
| `/city/[slug]/map` | Fullscreen interactive map |
| `/city/[slug]/analytics` | Analytics bento — KPIs, SLA, peak hours, category trends |
| `/r/[token]` | Public report status page (no account needed) |
| `/report` | Photo capture → submit flow |
| `/login` | Magic link + demo account sign-in |

### Resident (authenticated)
| Route | Description |
|---|---|
| `/user/my-reports` | All your reports with status |
| `/user/my-reports/[id]` | Report timeline, before/after evidence, CSAT |
| `/user/pulse` | Community pulse — fix rate, morale |
| `/user/updates` | Notification feed — status changes + announcements |

### Staff (role-gated)
| Route | Description |
|---|---|
| `/staff` | Work-order inbox with keyboard navigation |
| `/staff/map` | Operational map — open work orders, dispatch panel |
| `/staff/stats` | Analytics dashboard |
| `/staff/settings` | Department config, cost rules, SLA targets |

### API
| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | Public | DB + Gemini connectivity check |
| `POST /api/ai/classify` | Session or internal key | Trigger/retry classification |
| `POST /api/ai/reasoning` | Public | Explain a classification in plain language |
| `GET /api/open311/v2/services` | Public | Service catalog (Open311) |
| `GET /api/open311/v2/requests` | Public | List reports — filters: status, category, date, jurisdiction |
| `GET /api/open311/v2/requests/[id]` | Public | Single report (Open311) |
| `POST /api/open311/v2/requests` | Open311 API key | Create report from external client |
| `POST /api/auth/logout` | Session | Sign out |

---

## Data Model

### Core tables
| Table | Purpose |
|---|---|
| `cities` | Municipality — slug, name, state, PostGIS boundary, Open311 jurisdiction |
| `users` | Auth users — roles: `resident`, `staff_dispatcher`, `staff_supervisor`, `admin` |
| `reports` | Infrastructure reports — location (PostGIS), photo URLs, status, address, description, tags |
| `classifications` | AI output — category, severity (1–5), confidence, hazard radius, size estimate, emergency flag, reasoning |
| `work_orders` | Dispatched tasks — department, crew type, priority score, est. time, est. cost, AI rationale, resolution photo |
| `notifications` | Status update emails |

### Supporting tables
`verifications` · `merges` · `work_order_comments` · `classification_feedback` · `error_log` · `audit_log` · `assets`

### Enums
- **Status:** `open → dispatched → in_progress → closed` (also `merged`, `rejected`)
- **Categories:** `pothole · streetlight · downed_sign · graffiti · illegal_dump · water_leak · sidewalk_damage · tree_down · debris · drainage · faded_signage · other`
- **Departments:** `public_works · utilities · parks · code_enforcement · sanitation · other`

### Analytics views
`dashboard_reports_view` · `metric_resolution_rate` · `metric_mttr` · `metric_sla_compliance` · `metric_by_category` · `metric_peak_hours`

---

## Local Development

### Prerequisites
- Node.js 20+
- pnpm (`corepack enable`)
- Supabase project (or local Supabase CLI)
- Gemini API key

### Setup

```bash
corepack pnpm install
cp .env.example .env.local   # fill in required values
corepack pnpm db:migrate     # apply all 15 Supabase migrations
corepack pnpm db:seed        # seed Cumming, GA demo data
corepack pnpm dev            # http://localhost:3000
```

### Commands

```bash
pnpm dev          # dev server with Turbopack
pnpm build        # production build
pnpm start        # production server
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright end-to-end tests
pnpm lint         # Biome lint
pnpm lint:fix     # Biome lint + autofix
pnpm typecheck    # TypeScript (no emit)
pnpm db:migrate   # push Supabase migrations
pnpm db:seed      # seed demo data
pnpm health       # curl /api/health
```

---

## Environment Variables

### Required

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

### Optional

```bash
# Internal auth for background classification jobs
INTERNAL_CLASSIFY_SECRET=

# Error tracking
SENTRY_DSN=

# Open311 external client auth
OPEN311_API_KEY=
OPEN311_SYSTEM_USER_ID=      # UUID for system-created reports

# Email notifications (Resend)
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=
NOTIFY_DISABLE=              # set to "1" to suppress all emails

# Async classification (defers AI to background, default: sync)
NEXT_PUBLIC_ASYNC_CLASSIFY=  # set to "1" to enable

# Demo / staging
NEXT_PUBLIC_DEMO_MODE=
NEXT_PUBLIC_DEMO_SITE_URL=
NEXT_PUBLIC_TESTING_SITE_URL=
NEXT_PUBLIC_SITE_URL=        # origin for email deep-links

# Dev only — never set in production
DEV_AUTH_BYPASS=
```

---

## Demo Accounts

Seeded against the Cumming, GA demo city.

| Account | Password | Role |
|---|---|---|
| `usertest` | `usertest` | Resident |
| `admintest` | `admintest` | City admin |
| `teamtest1` | `teamtest` | Staff dispatcher |

Run `node scripts/create-demo-admin.mjs` to create the admin account if not already seeded.

---

## AI Pipeline — How It Works

```
Resident takes photo
        │
        ▼
On-device blur (ONNX)          ← faces + plates never leave device unblurred
        │
        ▼
Upload to Supabase Storage
  photos-public/  ← blurred, CDN-accessible
  photos-raw/     ← original, staff + service-role only
        │
        ▼
Gemini 2.5 Flash (raw image)   ← classifies unblurred copy for accuracy
  → category, severity, confidence, hazard radius, reasoning
        │
        ▼
Duplicate check (PostGIS)      ← geo radius + same category + time window
  match found → merge, escalate primary priority
  no match    → continue
        │
        ▼
Work order generated
  → department + crew type + est. time + est. cost + AI rationale
        │
        ▼
Resident gets /r/[token] link + email on every status change
```

If Gemini fails at any step → report is queued for manual triage. The pipeline never crashes a submission.

---

## Security

- **CSP per request** — nonce-based `script-src` in production; `strict-dynamic` trusts Next.js bootstrap chunks without listing every CDN host
- **RLS default-deny** — no table is readable without an explicit policy grant
- **Service role never in browser** — all service-role operations are server-only (Server Actions, Route Handlers)
- **Raw photos staff-only** — `photos-raw` bucket has no public policy; access requires a signed URL generated server-side
- **No PII in URLs** — tokens are random UUIDs, no email or user ID in query strings
- **Timing-safe key comparison** — internal API key checked with `crypto.timingSafeEqual`
- **Audit log** — PII access logged to `audit_log` with caller identity
- **HSTS preload** — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

---

## Competitive Position

|  | Civic | SeeClickFix | Tyler 311 | Granicus |
|---|---|---|---|---|
| Resident submit time | < 10 seconds | 2–3 minutes | Portal form | Portal form |
| AI classification | ✅ Gemini 2.5 | ❌ | ❌ | ❌ |
| On-device privacy blur | ✅ | ❌ | ❌ | ❌ |
| Public equity dashboard | ✅ by neighborhood | Partial | ❌ | ❌ |
| Open311 GeoReport v2 | ✅ full | ✅ | ✅ | Partial |
| Duplicate detection + merge | ✅ | ❌ | ❌ | ❌ |
| Deploy without city buy-in | ✅ | ❌ | ❌ | ❌ |
| Anonymous submit | ✅ | ❌ | ❌ | ❌ |

---

## What's Not Built Yet

| Feature | Notes |
|---|---|
| City scoreboard | Cross-city benchmarks and trend comparison |
| Web push notifications | Browser push on status change |
| Offline submit | IndexedDB queue + Background Sync API |
| i18n / Spanish | Localization |
| pgvector semantic dedup | Upgrade from geo+category dedup to embedding similarity |
| GDPR right-to-be-forgotten | Bulk deletion of PII on request |
