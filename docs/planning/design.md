# DESIGN

> Technical design doc for Civic. Follows the Google design doc structure. Read `CONTEXT.md` first for the "why."

**Status**: Draft v1.2
**Owner**: Soham Gugale
**Last updated**: 2026-05-27
**Reviewers**: TBD

---

## 1. Context and scope

Civic is an AI-native citizen repair reporting platform. Residents submit photos of broken infrastructure. A vision LLM classifies each photo and generates a structured work order. City staff dispatch from a prioritized inbox. A public dashboard makes city performance legible.

The pilot deployment is Cumming, Georgia. The architecture must be portable to other small US cities without rewriting per-city.

In scope for v1: photo intake, AI classification, work order generation, staff inbox, public dashboard, manual closure with crew "after" photo, Open311 GeoReport v2 export.

Out of scope for v1: predictive maintenance, dedup auto-merging, voice notes, automatic neighbor verification, native mobile apps. All are planned for v2 and listed in the Open Questions section.

## 2. Goals and non-goals

### Goals

1. **Resident time-to-submit under 10 seconds** from app open to confirmed submission, on a mid-range Android phone over 4G.
2. **AI classification accuracy above 90%** on a curated test set of 100 real photos across the 11 supported categories, measured as staff-confirmed match rate.
3. **Time-to-triage under 5 seconds** from submission to work order generated and visible in the staff inbox.
4. **Open311 GeoReport v2 conformance** verified by the Open311 community validator.
5. **Zero raw photos** (containing faces or license plates) leak to the public bucket. Verified by automated audit.
6. **Public dashboard Lighthouse scores**: Performance > 90, Accessibility > 95, SEO > 95.
7. **MVP shippable in 6 weeks** by one developer using AI tools, deployable on free tiers.

### Non-goals

1. **Not an emergency reporting system.** 911 is 911. We block submission and redirect when the classifier returns `is_emergency: true`.
2. **Not a city CRM.** No permits, no licenses, no tax queries, no general feedback.
3. **Not a social network.** No comments, upvotes, threads, or following. The public dashboard is the only social surface.
4. **Not a chatbot.** No "ask the city" conversational interface.
5. **Not a white-label toolkit.** We do not sell Civic as a platform for other vendors to rebrand.
6. **Not procurement-led.** We do not pursue formal RFPs in v1. Residents first.

## 3. System context diagram

```
                                                       ┌──────────────────┐
                                                       │  Local press     │
                                                       │  + council       │
                                                       └────────▲─────────┘
                                                                │ press-friendly
                                                                │ weekly summary
                                                                │
   ┌─────────────┐    photo + GPS    ┌────────────────────────────────────┐
   │ Resident PWA│ ─────────────────▶│            Civic API                │
   │ (iOS/Android│                   │  (Next.js on Vercel edge)           │
   │  Chrome)    │ ◀──── status ─────│                                     │
   └─────────────┘                   │  ┌────────────┐    ┌─────────────┐ │
                                     │  │ /api/report│    │ /api/ai/*   │ │
                                     │  └─────┬──────┘    └──────┬──────┘ │
                                     │        │                  │        │
                                     │        ▼                  ▼        │
                                     │  ┌──────────┐    ┌────────────────┐│
                                     │  │ Supabase │    │ Gemini 2.5     ││
                                     │  │ Postgres │    │ Flash (vision) ││
                                     │  │ +PostGIS │    └────────────────┘│
                                     │  │ +Storage │                      │
                                     │  └──────────┘                      │
                                     │        ▲                           │
                                     │        │                           │
                                     │  ┌─────┴───────┐   ┌─────────────┐ │
                                     │  │ Staff inbox │   │  Public     │ │
                                     │  │  (/staff)   │   │  dashboard  │ │
                                     │  └──────┬──────┘   │ /city/[slug]│ │
                                     │         │          └──────▲──────┘ │
                                     └─────────┼─────────────────┼────────┘
                                               │                 │
                                          dispatch         search engines
                                               │                 (SEO indexed)
                                               ▼
                                     ┌──────────────────┐
                                     │ City crew (web)  │   ◀─── Open311 sync
                                     │ + Open311 export │
                                     └──────────────────┘
```

## 4. Detailed design

### 4.1 Data flow

A submitted report moves through five stages:

1. **Capture and blur**: PWA captures photo, runs on-device face/plate blur, attaches GPS coords.
2. **Upload**: Blurred photo to `photos-public`, raw photo to `photos-raw` (TTL 30 days, RLS-restricted).
3. **Insert and classify**: Report row inserted. Server action enqueues `/api/ai/classify` call.
4. **Work order**: Classification result joined with rule table to produce work order. Status flips to `dispatched`.
5. **Resolution**: Crew uploads "after" photo. AI compares. Status flips to `closed`. Open311 status pushed.

### 4.2 Resident flow

The hard requirement is two taps from open to submit:

```
Open app → [Tap 1] camera → take photo → [Tap 2] submit → confirmation
```

No category picker. No required description. Location auto-attached. Optional 5-second voice note in v2.

If the classifier flags `is_emergency: true`, an interstitial blocks submission and directs the user to call 911 with a one-tap dial.

### 4.3 Staff flow

Inbox at `/staff` sorted by `priority_score DESC`. Each row already shows category, severity, work order, est cost, est time, crew type, materials. Keyboard navigable: `j/k` move, `enter` open, `d` dispatch, `c` close.

Dispatch auto-assigns based on department and crew availability. Crew receives a push notification with photo, location, materials list, and a deep link to navigation.

### 4.4 AI classification pipeline

Single endpoint: `POST /api/ai/classify` with `{ report_id }`. The server fetches the photo, calls Gemini 2.5 Flash with the schema below, persists the result, then runs a deterministic rule layer to produce the work order. Trade-off discussion in section 7.

**Prompt template** (version stored in `classifications.model_version`):

```
You are a city infrastructure classifier. You will receive a photo from a citizen
reporting a problem in their neighborhood.

Return ONLY a JSON object matching this schema. No prose, no markdown, no code fences.

{
  "category": one of: "pothole", "streetlight", "downed_sign", "graffiti",
              "illegal_dump", "water_leak", "sidewalk_damage", "tree_down",
              "debris", "drainage", "faded_signage", "other",
  "subcategory": short string describing the specific problem,
  "severity": integer 1 to 5 where 1 is cosmetic and 5 is immediate hazard,
  "hazard_radius_m": estimated meters of affected area,
  "visible_size_estimate": short string like "30cm wide pothole" or "10m of cracked sidewalk",
  "is_emergency": boolean, true only if active danger to life,
  "confidence": number between 0 and 1,
  "reasoning": one sentence explaining the classification
}

If the photo does not show a clear infrastructure problem, return category "other"
with confidence below 0.5.

If the photo shows an active emergency (downed live wire, gas leak smell described
in voice note, major water main break), set is_emergency to true.
```

**Sample output (pothole):**

```json
{
  "category": "pothole",
  "subcategory": "asphalt pothole in road lane",
  "severity": 3,
  "hazard_radius_m": 2,
  "visible_size_estimate": "40cm wide, approx 8cm deep",
  "is_emergency": false,
  "confidence": 0.94,
  "reasoning": "Clear asphalt depression in active traffic lane with exposed substrate"
}
```

### 4.5 Work order generation

For v1, the work order is deterministic given the classification. A rules table (see Appendix A) maps `category` to `(department, crew_type, default_est_minutes, materials)`. Severity multiplies the priority score, not the time estimate.

Priority score:
```
priority = (severity * 2)
         + (foot_traffic_weight * 1.5)
         + (school_zone_bonus * 3)
         + (recurrence_bonus * 1)
         + (emergency_override * 50)
         - (age_in_hours * 0.01)
```

We start with rules instead of an LLM call for the work order because (a) it cuts cost by 50%, (b) staff can audit and edit the table, and (c) it removes a failure mode. We will revisit if staff override rate goes above 20%.

### 4.6 Data model

PostgreSQL with PostGIS. Schema lives in `supabase/migrations/`. Highlights only here; full definitions in Appendix B.

- `cities`: city slug, boundary polygon, Open311 jurisdiction_id, active flag.
- `users`: role-based (resident, staff_dispatcher, staff_supervisor, admin), scoped to a `city_id`.
- `reports`: the citizen submission. Links to public and raw photo URLs separately. `status` enum: open, dispatched, in_progress, closed, merged, rejected.
- `classifications`: one per report. Stores raw model response and `model_version` for replay.
- `work_orders`: one per non-merged report. Materials as `jsonb`. Resolution photo URL and `resolution_ai_score`.
- `assets`: city infrastructure (streetlights, hydrants, signs). Powers v2 predictive maintenance.
- `merges`: dedup tracking. In v1 we log but do not auto-merge.
- `verifications`: closure votes from resident and neighbors.

All location columns are `geography(POINT, 4326)`. Indexed with GiST.

### 4.7 Open311 compatibility

Open311 GeoReport v2 is the API spec adopted by SF, DC, Boston, NYC, and ~30 other US cities. SeeClickFix, Lagan, Motorola PremierOne, and other major vendors implement it.

We treat Open311 as a first-class output. Every report Civic stores is exportable in Open311 XML and JSON via:

- `GET /api/open311/v2/services.json` - list of service codes supported
- `GET /api/open311/v2/requests.json` - service request list
- `POST /api/open311/v2/requests.json` - create a service request
- `GET /api/open311/v2/requests/{id}.json` - request status

Service code mapping (`category` to Open311 `service_code`) is defined in `lib/open311/services.ts`. We aim for the canonical SF service codes where they exist to maximize interop.

For cities not yet partnered with us, we can also be an Open311 *client*: poll their Open311 endpoint, ingest their reports, and surface them on a public dashboard for that city. This is the "shadow dashboard" strategy and is enabled by Open311 from day one.

### 4.8 Privacy design

Privacy is a Google-required cross-cutting concern. This section is intentionally thorough.

**Photo capture pipeline:**

1. PWA captures photo at full camera resolution.
2. On-device model (ONNX face detector + plate detector via `onnxruntime-web`) runs. Bounding boxes are gaussian-blurred client-side.
3. Two versions produced: blurred (public) and original (raw).
4. Both uploaded over HTTPS with short-lived presigned URLs. Blurred to `photos-public` (read by anyone with the report ID), original to `photos-raw` (read only by city staff for that city, and only if the report is open).
5. `photos-raw` has a 30-day TTL. After 30 days the object is deleted by a scheduled Supabase function. The report row keeps a hash for audit.

**RLS policies:**

- `reports`: residents can `select` and `insert` their own. Staff can `select` and `update` reports in their `city_id`. Public dashboard reads through a `dashboard_view` that strips PII.
- `users`: residents see only themselves. Staff see other staff in their city.
- `photos-raw` bucket: signed-URL access only, expiring in 10 minutes, granted only for staff of the matching `city_id`.

**Data retention:**

- Reports retained indefinitely (they are the public record).
- Raw photos: 30 days.
- Audit logs: 1 year.
- Reporter identity: hashed on the public dashboard view. Real identity retained on the report row.

**Right to be forgotten:**

A `DELETE /api/account` endpoint anonymizes the user row (set email to NULL, set hash), and replaces `reporter_id` with a `deleted_user` sentinel on all their reports. Reports themselves are not deleted because they are public-interest data.

### 4.9 Security

- All API routes require auth except `/api/open311/*` reads and the public dashboard.
- Service role key never leaves the server. RLS is the enforcement mechanism, not the bypass.
- Mapbox token is URL-restricted at the Mapbox dashboard.
- Supabase auth has rate limits set on magic link send (5 per email per hour).
- CSP headers set in `next.config.ts`. No inline scripts.
- All file uploads MIME-checked server-side, not just by extension.
- Audit table tracks every write by staff users.

### 4.10 Observability

What we instrument from day 1:

- **Sentry** for error tracking on client and server.
- **Logflare** for structured logs from edge functions.
- **Vercel Analytics** for web vitals.
- **Custom metrics table** for product metrics (time-to-submit, time-to-triage, classification accuracy).

The metrics table is queried by an internal dashboard at `/admin/metrics`. North-star metrics defined in section 6.

### 4.11 Cost model

At pilot scale (1000 reports / month in Cumming):

| Line | Unit cost | Volume | Monthly cost |
|------|-----------|--------|--------------|
| Gemini 2.5 Flash vision | $0.0001 per call | 1000 | $0.10 |
| Gemini embeddings (dedup) | $0.00001 per call | 1000 | $0.01 |
| Supabase free tier | $0 | - | $0 |
| Mapbox free tier (< 50k loads) | $0 | - | $0 |
| Vercel hobby | $0 | - | $0 |
| Sentry developer plan | $0 | - | $0 |
| **Total** | | | **~$0.11** |

At 100k reports / month (multi-city scale):
- Gemini: ~$10/mo
- Supabase Pro: $25/mo
- Mapbox: ~$50/mo
- Vercel Pro: $20/mo
- Total: ~$105/mo

The unit economics are essentially free until well past pilot scale.

## 5. Cross-cutting concerns

| Concern | Approach |
|---------|----------|
| Security | RLS as primary enforcement, signed URLs for raw photos, CSP headers, MIME validation |
| Privacy | Client-side blur, separate buckets, 30-day TTL on raw, right-to-be-forgotten endpoint |
| Observability | Sentry + Logflare + custom metrics table, queried from `/admin/metrics` |
| Accessibility | Lighthouse a11y > 95 on dashboard, semantic HTML, keyboard nav on staff inbox |
| SEO | Public dashboard SSG with per-page meta, sitemap, structured data (LocalGovernment schema) |
| Performance | Edge runtime, image optimization, PostGIS GiST indexes, supercluster for map markers |
| Internationalization | English only for v1. Spanish in v2 (Forsyth Co has growing Spanish-speaking population) |
| Compliance | Open311 GeoReport v2 conformance. Section 508 a11y. CCPA-aligned even though Georgia has no equivalent. |

## 6. North-star metrics

Tracked from day 1. SQL views committed in `supabase/migrations/metrics_views.sql`.

| Metric | Target | Source |
|--------|--------|--------|
| Time-to-submit (P50) | < 10s | client telemetry |
| Time-to-triage (P50) | < 5s | server logs |
| Time-to-resolution (P50) | < 72h | `work_orders.completed_at - reports.created_at` |
| Classification accuracy | > 90% | staff confirmation rate |
| First-trip fix rate | > 75% | dispatches with no return visit |
| Dedup rate | track, not target | merges per 100 reports |
| Reporter return rate (30 day) | > 30% | active reporter cohort |
| Lighthouse perf on dashboard | > 90 | CI check |
| Cost per report | < $0.001 | sum of AI + storage |

## 7. Alternatives considered

This section is the most important part of the doc. We list the realistic alternatives for each major decision and explain why we chose the path we did.

### 7.1 Vision model: Gemini 2.5 Flash vs alternatives

**Considered**:
- GPT-4o / GPT-4o-mini (OpenAI)
- Claude 3.5 Sonnet (Anthropic)
- Self-hosted open-source vision model (LLaVA-1.6, Qwen-VL)
- Custom-trained CNN on city infrastructure dataset

**Chose Gemini 2.5 Flash** because:
- Cheapest vision model at production quality. ~5x cheaper than GPT-4o-mini.
- Latency under 2 seconds on a typical photo, beats all other hosted options.
- JSON mode reliable enough with the prompt as written.

**Trade-off**: Vendor lock-in to Google. We mitigate by routing through OpenRouter so we can swap in GPT-4o-mini or Claude Sonnet with one env change if Gemini changes pricing or quality.

**Why not self-hosted**: At pilot scale the cost savings are <$1/month and we add infrastructure complexity. Reconsider above 1M reports/month.

**Why not custom CNN**: We do not have labeled training data yet. By the time we do, the foundation models will probably still be better and we will have spent months on something that hosted models do for free.

### 7.2 Database: Supabase Postgres vs Firebase vs custom

**Chose Supabase** because:
- PostGIS is the right answer for geo. Firebase's geo support is afterthought-tier.
- RLS in Postgres is more powerful than Firebase security rules.
- We get realtime, storage, and auth bundled.
- Postgres is portable. If we outgrow Supabase, we move to RDS without a rewrite.

**Why not Firebase**: Geo capabilities, SQL maturity, no vendor lock-in.

**Why not custom Postgres on Fly.io or Railway**: Backup, auth, and storage are not the place to differentiate. Supabase free tier covers the pilot and the team behind it is solid.

### 7.3 Mobile: PWA vs React Native vs native

**Chose PWA first** because:
- One codebase. Solo developer.
- iOS PWA finally works for camera and push (2025+).
- App Store review delays would kill pilot velocity.

**Trade-off**: iOS PWAs cannot keep camera permission across app reopens reliably. We work around with the Web Share Target API and a "snap from camera" intent.

**When to revisit**: If activation rate is hurt by the install friction (PWA add-to-homescreen still has discovery problems), we evaluate React Native for v2.

### 7.4 Work order generation: rule table vs LLM call

**Chose rule table** for v1 because:
- 50% cost reduction per report.
- Staff can audit and edit the mapping in `lib/open311/services.ts`.
- Removes one stochastic failure mode.
- The classification is the hard part. The work order from a known category is rote.

**When to revisit**: If staff override rate on auto-generated work orders exceeds 20%, switch to LLM-generated work orders with the rule table as a fallback.

### 7.5 Dedup: similarity threshold + auto-merge vs review queue vs no dedup

**Chose log-but-do-not-merge for v1** because:
- An incorrect merge is much worse than a missed merge. Residents losing their report into someone else's ticket damages trust.
- We do not yet have enough data to set the right similarity threshold.

**When to revisit**: After 6 months of data, ship auto-merge with a 0.85 similarity threshold and a one-tap "this is different" override for residents.

### 7.6 Hosting: Vercel vs Render vs Cloudflare Pages

**Chose Vercel** because:
- Next.js 15 App Router has the best Vercel support.
- Edge runtime is mature.
- Free tier covers pilot.

**Trade-off**: Vendor lock-in to Vercel-specific features (image optimization, edge config). We minimize this by avoiding Vercel-only APIs and writing everything to be portable to a Node host.

### 7.7 GTM: residents-first vs procurement-first

**Chose residents-first** for the reasons in CONTEXT.md (see "The wedge"). The technical implication of this choice is that the public dashboard and resident PWA must be production-quality before staff tools are. Order matters.

### 7.8 Standards: Open311 vs proprietary API vs both

**Chose Open311-first** because:
- It is the existing standard. Adopting it is table stakes for ever selling to a city.
- It lets us ingest data from cities not yet partnered with us, enabling shadow dashboards.
- Internal API can extend Open311, not replace it.

**Trade-off**: Some of our richer data (work order details, AI confidence, predicted maintenance) does not fit cleanly in Open311's schema. We use Open311's `extended_attributes` extension where possible.

## 8. Open questions

These are unresolved and worth revisiting quarterly:

1. **Where does Forsyth County government fit?** Many infrastructure assets in the Cumming area are county-owned, not city-owned. Do we model county and city as separate `cities` rows, or add a parent-child relationship?
2. **What happens when a report straddles jurisdictions?** A pothole on a county road inside city limits. Manual override for now. Real solution unclear.
3. **At what user count do Supabase free-tier limits bite?** Currently estimate 5000 active monthly users in Cumming before we need Pro.
4. **Is the on-device blur model accurate enough?** Privacy is non-negotiable. If false-negative rate on face detection is above 1%, we need server-side fallback before public launch.
5. **How do we handle false reports and abuse?** Per-reporter rate limit and a staff "reject" action exist. Beyond that, unclear.
6. **When does the predictive layer ship?** v2 dependency on having 6+ months of report data. Need city asset import tooling before then.

## 9. Appendix

### A. Work order rules table

| Category | Department | Crew type | Default est min | Materials |
|----------|------------|-----------|-----------------|-----------|
| pothole | public_works | paving | 30 | cold patch, tamper |
| streetlight | electrical | line crew | 60 | bulb, fuse, lift truck |
| downed_sign | signs | sign crew | 20 | post, bolts |
| graffiti | parks | cleanup | 40 | solvent, pressure washer |
| illegal_dump | sanitation | cleanup | 45 | truck, gloves |
| water_leak | water | line crew | 120 | varies by severity |
| sidewalk_damage | public_works | concrete | 240 | concrete mix, forms |
| tree_down | parks | arborist | 90 | chainsaw, chipper |
| debris | sanitation | cleanup | 20 | truck |
| drainage | public_works | drain crew | 90 | jet truck |
| faded_signage | signs | sign crew | 25 | replacement sign |
| other | review_queue | - | - | - |

### B. Failure modes and handling

| Failure | Handling |
|---------|----------|
| Photo of nothing recognizable | Confidence below 0.5, route to "needs review" |
| Photo contains a person, not infrastructure | Auto-reject. Notify resident. Do not store. |
| Problem on private property | Tag `is_private_property`. Separate queue. City decides. |
| Two reports of same issue in same second | Second waits for first to be classified, then dedup runs |
| Confidence below 0.7 | Staff sees "uncertain" flag. One-click override becomes training data. |
| Resolution photo does not match a fix | Block closure. Supervisor approval required. |
| Resident submits 6 reports in 1 hour | Soft rate limit (3 per hour per location). Soft flag beyond. |
| Malicious report (false claim, abuse) | Staff reject. Two rejects in 30 days triggers review. |

### C. Open311 service code mapping

See `lib/open311/services.ts` for canonical mapping. We follow SF jurisdiction codes where they exist for maximum interop.

### D. Glossary

- **311**: the standard non-emergency phone number in US/Canada. Also the umbrella term for citizen request management.
- **GeoReport v2**: the current Open311 API spec.
- **PWA**: Progressive Web App. Web app installable to home screen with native-like behavior.
- **RLS**: Row-level security. Postgres feature for per-row access control.
- **PostGIS**: Postgres extension for geographic data.
- **Work order**: the dispatchable artifact derived from a classified report.
- **Shadow dashboard**: a public dashboard Civic publishes for a city that has not partnered with us, using their public Open311 endpoint as the data source.

---

This is a living document. Material changes require an ADR in `docs/decisions/`. Section 7 (Alternatives Considered) is the most valuable record of decisions. Update it whenever a path is rejected.