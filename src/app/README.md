# src/app/

Next.js App Router. Server components by default; `"use client"` only where
interactivity actually requires it.

Four audiences share this tree, and they barely overlap:

| Audience | Routes | Auth |
| --- | --- | --- |
| Residents | `/report`, `/user/*`, `/r/[token]` | Anonymous, or a lightweight resident session |
| City staff | `/city/[slug]/*`, `/teams` | Authenticated, scoped to a city |
| Platform admin | `/admin/*` | Authenticated, cross-city |
| Machines | `/api/open311/v2/*`, `/api/open-data/*` | API key |

## Read this before deleting anything under `staff/`

`src/app/staff/` **contains no `page.tsx`**. The `/staff` route UI is scrapped.
Team views and the `/teams` picker are canonical.

What is left there is seven server-action modules (`actions.ts`,
`bulk-actions.ts`, `merge-actions.ts`, `route-actions.ts`, `schedule-actions.ts`,
`surge-actions.ts`, `evidence-actions.ts`), and they are imported from at least
ten places across `components/city/`, `components/teams/`, `components/staff/`,
`components/map/` and `city/[slug]/team/[teamId]/route/`.

The directory name says "dead route". The contents are live mutation code for
the routes that replaced it. Check imports before removing anything here.

## Resident routes

- `/`: landing. Ships a static hero plate rather than mounting maplibre +
  deck.gl on every visit; `scripts/capture-hero-map.mjs` regenerates it.
- `/report`: camera-first intake. Camera denied falls back to upload;
  geolocation, unreliable on some Android builds, falls back to tapping the map.
- `/r/[token]`: the public status page. **No account required**, keyed on an
  opaque salted token, never a report id, because requiring a login is how a
  city loses the reporter. Translated into six languages.
- `/user/*`: the signed-in resident surface: my reports, map, pulse, trending,
  updates.
- `/embed/report`: the intake flow embedded in a city's own site.
- `/offline`: service-worker fallback. Note it is a fallback *page*, not offline
  capture; a resident with no signal still cannot file.

## Staff routes

`/teams` is the entry point. `/city/[slug]` is the dashboard, and the useful
thing about it is what it lacks: no inbox, no queue of unread reports waiting to
be categorised, because by the time a report lands here it already has a
category, severity, cost, division and crew.

Beneath it: `grid` (the AG Grid view staff actually live in), `map`, `analytics`
(+ `heatmap`), `calendar`, `routing`, `duplicates`, `hotspots`, `trending`,
`browse`, `leaderboard`, `members`, `documents`, `qr`, `report-pack`, `video`.

Two parallel sub-trees:

- `team/[teamId]/`: analytics, calendar, field, map, route, schedule.
  `field` is the phone view a crew uses in a truck.
- `crew/[crewType]/`: analytics, calendar, map.

`/contractor` and `city/[slug]/contractors/[contractorId]` exist because a small
city's paving is often not done by the city, and a private contractor sits in
the same dispatch path as the municipal crews.

## Admin routes

`/admin/*`: API keys, automation, cities, claims, compliance, contractors,
districts, import, liability, onboard, org-tree, privacy, qr, requests,
retention, routing, sso, webhooks. Cross-city; scope enforcement lives in
`lib/auth/admin-scope.ts`, not in the page.

## API routes

`api/` holds only what genuinely must be an HTTP endpoint. Everything else is a
server action, that is rule 9 in `agents.md`, and the exceptions are:

**`api/ai/*`**: `classify`, `chat`, `intake`, `translate`, `reasoning`,
`corpus`, `org-tree`. These exist so the browser never holds a Gemini key.
**No client code may call a model directly.**

**`api/open311/v2/*`**: `services`, `services/[service_code]`, `requests`,
`requests/[id]`, `tokens/[token]`. External agencies call these, so the contract
is fixed by the GeoReport v2 spec rather than by us. Both JSON and XML, content
negotiated. `POST /requests` requires an `api_key`.

**`api/open-data/reports`**: the bulk public export.

**`api/admin/*`**: `drift`, `impact-export`, `notify-drain`, `sla-escalate`,
`surge`. Cron and operator targets, bearer-token gated. `e2e/staff-triage.spec.ts`
asserts they 401 without a session and reject a wrong token.

**`api/camera/frames`**, **`api/sms/inbound`**: device and Twilio webhooks.

**`api/health`**: checks database and AI reachability. Check it before
believing a demo: a missing service key renders several pages empty and
*healthy-looking*, which is the one failure mode that survives a rehearsal.

## Conventions

- No PII in a URL or query string. Ever. `/r/[token]` is opaque for this reason.
- Mutations are server actions returning `{ ok: true, data } | { ok: false, error }`.
- Route segments own their data fetching; components take props. A component
  reaching for a Supabase client directly is a smell.
- `demo/camera` and the `demo-*` helpers in `lib/` are demo scaffolding, gated by
  `lib/demo-mode.ts`: not a production surface.
