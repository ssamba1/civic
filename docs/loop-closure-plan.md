# Civic — Loop-Closure & Two-Sided UX Plan

**Status:** Proposed · **Date:** 2026-06-13 · **Owner:** ssamba1
**Scope:** Resident surface (`/user/*`, `/report`, `/`) + City/gov-admin surface (`/city/[slug]/*`, `/staff/*`)
**Companion:** see root `PLAN.md` for routes/layouts/migrations already shipped.

---

## 0. The one bet

Build the product around **closing the loop**. Boston 311 field experiment (Buell, Porter & Norton, *Surfacing the Submerged State*, *M&SOM* 23(4):781–802, 2020): residents who received **a photo of the completed work** on resolution filed **~60% more reports across ~38% more categories** over the following 13 months. The inverse — silent resolution — actively *erodes* the reporter.

Critical caveat from the same study (Study 2): a public surface that dumps the **open-ticket backlog** as "transparency" produced **no lift over a stats-only baseline**. Visible *effort* without visible *completion* does nothing. Foreground resolved work + photos.

Everything below serves that bet. Right now the loop is severed at every stage: resident files → no tracking surface → no real notification → silent close → no resolution photo. Fixing it is P0.

Sources: [INFORMS/M&SOM](https://pubsonline.informs.org/doi/10.1287/msom.2020.0877) · [HBS Working Knowledge](https://www.library.hbs.edu/working-knowledge/how-government-can-restore-the-faith-of-citizens) · [INFORMS press](https://www.informs.org/News-Room/INFORMS-Releases/News-Releases/Show-Me-Don-t-Tell-Me-Operational-Transparency-Increases-Trust-Support-of-Government)

---

## 1. Ground truth — what already exists (don't rebuild)

Audited against migrations through `20260610_009` and current `src/`.

| Capability | State | Location |
|---|---|---|
| Open311 GeoReport v2 API (GET/POST `/requests`, `/services`) | **EXISTS** | `src/app/api/open311/v2/**` |
| `cities.open311_jurisdiction_id` | **EXISTS** | migration `001:73` |
| `notifications` table + RLS + Realtime publication | **EXISTS** | migration `006:40–139` |
| Status-change → notification DB trigger (`notify_report_status_change`, SECURITY DEFINER) | **EXISTS** | migration `006:90–123` |
| Location capture via `navigator.geolocation` at capture time (NOT EXIF) | **EXISTS, correct** | `report/page.tsx:102–127` |
| Client-side face/plate blur (Shape Detection API + heuristic fallback) | **EXISTS** | `lib/privacy/blur.ts` |
| Anon-first session (`signInAnonymously`) | **EXISTS** | `anon-bootstrap.tsx` |
| `city_stats` / `city_category_breakdown` RPCs | **EXISTS** | migration `009:71–136` |
| Vitest unit tests (classify, routing, dashboard no-throw) | **EXISTS** | `*.test.ts` (11 files) |

| Capability | State | Note |
|---|---|---|
| Email / SMS / web-push **delivery** | **MISSING** | No Resend/Twilio/SendGrid/web-push anywhere. The trigger writes in-app rows only. |
| `closed_at` / `resolved_at` on reports | **MISSING** | Resolution time lives on `work_orders.completed_at`. Morale math wrongly uses `created_at`. |
| Per-category **SLA** / `expected_datetime` column | **MISSING** | Computed ad-hoc from work-order estimate. |
| **Resolution photo** field | **MISSING** | No first-class close-photo. This is the 60% lever. |
| DB-backed **teams / routing rules / crew roster** | **MISSING** | Teams are in-memory (`lib/teams.ts`); routing hardcoded in `work-order-rules.ts`. No `team_id` FK. |
| `in_progress` and `merged` write paths | **MISSING** | Enum values exist; no code transitions a report into them. |
| Duplicate detection at file time | **MISSING** | — |
| Category deflection (emergency → call line) | **MISSING** | `is_emergency` exists on classification, not as a pre-submit gate. |
| E2E tests (report→classify→dispatch→close) | **MISSING** | `test:e2e` script configured, zero specs. |

**Implication:** the close-the-loop work is mostly *finishing wiring that's half-built*, not greenfield. The notification **substrate** exists; it has no **delivery** and anon users never trigger real writes.

---

## 2. Architecture decision — keep the split, unify the routes

Research validates the existing shape (commits `80fe3ef` anon-first resident, resident/city UI split):

- **Shared data model, two front-end surfaces, role-gated** — SeeClickFix/CivicPlus pattern. Do NOT collapse to one UI with a role toggle. Resident stays radically simple (report + upvote + track); admin stays rich (cost/urgency/contacts/routing). ([CivicPlus](https://www.civicplus.com/seeclickfix-311-crm/))
- **Anonymous to the *public*, not to the *city*** — FixMyStreet model; Boston 311 was ~51% anonymous, and anonymity widened participation among renters/young residents. Never gate filing behind an account. ([FixMyStreet](https://www.fixmystreet.com/pro-manual/citizens-experience/))

**Decision D1 — collapse duplicate routes.** `/city/[slug]/*` and `/[team]/[city]/*` both exist and prerender. Make `/city/[slug]` canonical; express team as a segment/query under it (`/city/[slug]?team=streets_roads`). Delete `/[team]/[city]/*`. ViewSwitch and CityHeader already point at `/city/[slug]`, so the old tree is dead weight that fragments the mental model and orphans team context on city-switch.

**Decision D2 — Open311 status projection.** Keep the 6 internal states as source of truth; project to the 2-value public enum at the API edge. Public `status ∈ {open, closed}` only; richer state rides in `status_notes`. `merged`/`rejected` serialize to `closed` + note; `merged` is a FK link, not an invented status. ([Open311 #61](https://github.com/open311/open311.github.io/issues/61) · [GeoReport v2](https://wiki.open311.org/GeoReport_v2/))

```
internal          → open311 status   status_notes
open              → open             —
dispatched        → open             "Dispatched to crew"
in_progress       → open             "In progress" (+ETA if set)
closed            → closed           resolution note (+ photo via updates feed)
merged            → closed           "Duplicate of #<public_id of merged_into>"
rejected          → closed           reason
```

All Open311 datetimes ISO-8601 with mandatory `Z`/offset. `media_url` is single in core spec — expose primary report photo there, surface the **resolution photo via the Service Request Updates feed** (each update carries its own `media_url`). ([GeoReport v2 Extensions](https://wiki.open311.org/GeoReport_v2/Extensions/))

---

## 3. Workstreams

The 52 audited issues collapse into 6 workstreams. Full issue register in §7.

| WS | Theme | Issues | Priority |
|---|---|---|---|
| **A** | Resident loop closure (track + notify) | 1–8, 25, 44–46 | **P0** |
| **B** | Notification delivery (email/push) | new + 4, 18, 24 | **P0→P1** |
| **C** | Data correctness (time, deltas, status) | 16–24 | **P1** |
| **D** | Multi-city + route unification | 9–15 | **P1** |
| **E** | Admin: routing, SLA, KPIs, map | 27–31, 47–52 | **P2** |
| **F** | Accessibility (WCAG 2.1 AA, §508) + state polish | 26, 32–43 | **P2** |

---

## 4. Phased roadmap

### Phase 0 — Restore the loop (P0, ~1–2 days)
*Goal: a resident who files a report can find it, see its timeline, and gets a real status notification.*

- Un-stub the 3 login-wall pages → render real data: `user/page.tsx`, `user/my-reports/page.tsx`, `user/my-reports/[reportId]/page.tsx`. Data layer (`getMyReports`/`getMyReport`/`getReportTimeline`) already exists.
- Add **My Reports** tab: `user-nav.tsx` (desktop) + `bottom-tab-bar.tsx` (mobile). Re-layout the 4→5 mobile tabs around the FAB.
- `getCurrentResident`: return real `user.id` when authed; only fall back to `demoReporterId()` when null. Drop the module-global cache bug (`_demoReporterId` leaks across residents).
- `syntheticNotifications`: stop skipping `status==="open"` — a freshly filed report must produce an acknowledgement.
- Ensure anon users get a `public.users` row on **sign-in**, not just on first report (so the status-change trigger has a `user_id` to write to). Today's row-on-first-report means the trigger's first write can no-op.
- Guard double-submit in `report/page.tsx`; hide "Track this report" link when classification confidence < 0.5.

**Acceptance:** File a report as a fresh anon visitor → it appears in My Reports immediately → an in-app "received" notification exists → status timeline renders filed/dispatched/in-progress/resolved.

### Phase 1 — Resolution photo + notification delivery (P0 lever, ~3–4 days)
*Goal: the 60% lever. Residents get a real out-of-band notification with a resolution photo on close.*

- **Schema** (new migration, follow the "NOT auto-applied / opt-in" convention used by `007`):
  - `reports.resolved_at timestamptz` (or read from `work_orders.completed_at` consistently — pick one, document it).
  - `report_media(report_id, url, kind in ('report','resolution'), is_primary)` — supports the close photo.
  - `report_updates(update_id, report_id, status, description, media_url, updated_datetime)` — append-only; powers both the resident timeline and the Open311 updates feed.
- **Staff close flow** (`staff/actions.ts:closeWorkOrder`): require a resolution note; allow/prompt a resolution photo (run it through the same blur+EXIF-strip pipeline). Write a `report_updates` row.
- **Delivery service** — email-first (Resend/SES). A worker drains unsent `notifications` rows → renders email (inlines the staff note + resolution photo) → sends. Web push for logged-in app users; SMS reserved for opt-in/urgent only. Per-channel + per-event-type preferences; unsubscribe link on every email. Batch community/comment noise into a digest. ([SeeClickFix per-stage email](https://www.civicplus.help/seeclickfix/docs/change-request-status) · [GoGov multi-channel](https://www.gogovapps.com/crm) · [notif fatigue UX](https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/))
- **Notification trigger model** — notify on: received, acknowledged/assigned (with note), in-progress *only if it carries an ETA/note*, resolved (mandatory photo+note), reopened. Suppress internal hand-offs and bookkeeping.
- **Anonymous-reporter status page** — tokenized (unguessable) tracking code + shareable `/r/<token>` status URL: current status, original report, timeline, and resolution photo prominent on close. Mirrors FixMyStreet confirm-link model so no-account reporters still close the loop. ([FixMyStreet FAQ](https://www.fixmystreet.com/faq))
- **CSAT** — one-tap "Was this resolved? 👍/👎" embedded in the resolution notification; optional ~4-week "still fixed?" check, opt-in after the first.

**Acceptance:** Staff closes a report with a photo → resident receives an email (or push) containing the photo + note within the poll/queue interval → CSAT click recorded → public token URL shows the resolution photo.

### Phase 2 — Data correctness (P1, ~2 days)
- Thread an explicit `now` through `resident-data` / `dashboard-data` / `analytics-data`; stop independent `Date.now()` calls that drift week-buckets between city and resident views.
- `resolvedThisWeek` and momentum: measure off `resolved_at`, not `created_at`. "Resolved this week" must mean *closed* in the last 7 days.
- `pctChange`: return `null` for undefined deltas (0→N is not "100% growth"); render as "new", not a percentage.
- Tie-break category sorts (`localeCompare`) for stable ordering across reloads.
- `fetchCityStats` error path: distinguish "error" from "quiet city" — surface an error state, not all-zeros.
- `reporter_id`: keep nullable or use an explicit `anonymous` sentinel; stop coercing to `""`.
- Document/centralize `synthStageTimes` determinism contract (or replace with persisted `report_updates` once Phase 1 lands).

### Phase 3 — Multi-city + route unification (P1, ~2 days)
- Thread `citySlug` from session → layout → `ViewSwitch` (kill the hardcoded `"cumming"`).
- `submitReport`: resolve city from the reporter's profile/geo, not a Cumming fallback that silently mis-files.
- Staff: banner when `city_id` is unresolved instead of silent Cumming default.
- Execute **D1**: delete `/[team]/[city]/*`, make team a segment under `/city/[slug]`. Preserve team context on city-switch.
- FilterBar: when `lockedTeam` is set, render the team selector disabled with a "locked" badge.

### Phase 4 — Admin routing / SLA / KPIs / map (P2, ~4–5 days)
- **Routing**: `routing_rules(category, zone_polygon_id, priority) → department/crew`; resolve zone via PostGIS `ST_Contains` on `cities.boundary`-style polygons; default catch-all department (alerted) so nothing drops. Auto-create the work order on route — no human-triage bottleneck. ([GIS routing](https://catalisgov.com/public-works/gis-insights-help-311-teams-prioritize-resources/))
- **SLA**: per-category `sla_hours`; stamp `due_at = assigned_at + sla_hours`; scheduled job flags overdue + auto-escalates to supervisor; warn at 80%. MVP defaults: pothole 72h, streetlight 5 business days, graffiti 3d, sidewalk/rodent ~30d. ([NYC 311 SLA dataset](https://data.cityofnewyork.us/City-Government/311-Service-Level-Agreements/cs9t-e3x8))
- **KPIs** (label precisely, segment by category + zone): SLA-compliance % (headline; 90–95% benchmark), backlog-age profile (leading indicator), Mean-Time-to-Resolution, reopen rate, first-response-time for high-priority. Kill any single org-wide "average resolution time".
- **Map**: supercluster + viewport bbox/zoom query (`getClusters`), re-query on `moveend`; heatmap at low zoom; add an Apply/pending affordance so it stops thrashing on every filter click. Client clustering is fine under ~100k points. ([supercluster](https://www.npmjs.com/package/supercluster))
- Decide `in_progress`/`merged`: either wire real transitions or remove from the enum. Duplicate-merge at file time feeds `merged_into_id`.

### Phase 5 — Resident friction + a11y polish (P2, ~3 days)
- **Duplicate deflection at file time**: query open reports within ~100 m + same category; show "similar nearby" cards with primary CTA **"Add your voice"** (upvote + subscribe) before submit. ([SeeClickFix 100 m + type](https://www.civicplus.help/seeclickfix/docs/mark-a-request-as-a-duplicate))
- **Category deflection**: data-driven `is_emergency` + `deflection_message` + phone on category pick → replace submit with "call 911 / city line" interstitial. ([FixMyStreet](https://fixmystreet.org/pro-manual/print/))
- **Blur hardening**: server-side EXIF strip before re-hosting (browsers don't reliably strip); track the center-third face-leak limitation.
- **A11y → WCAG 2.1 AA (§508 legal floor)**: focus trap on modals; fix `text-zinc-600`-on-black contrast; aria-labels on category color dots (color-alone meaning); action-phrased tab labels; `aria-hidden` the redundant unread dot; ≥44px hit targets on wrapped tag toggles; z-index collision between updates-popover and mobile ViewSwitch; route-specific loading skeletons; mock-vs-DB source indicator. Lean on USWDS patterns. ([§508/USWDS](https://www.section508.gov/develop/accessible-design-using-uswds/) · [WCAG 2.1](https://www.w3.org/TR/WCAG21/))

---

## 5. Metrics — prove the loop closed

- **Loop-closure rate**: % of resolved reports whose reporter received a delivered notification (target → 100%).
- **Resolution-photo coverage**: % of closes with a photo (the lever; target high).
- **Re-engagement**: repeat-report rate of notified vs not (watch for the Boston-style lift).
- **CSAT** on close; **reopen rate** as the quality backstop.
- **Time-to-first-acknowledgement** (silence here is the primary trust-killer).

---

## 6. Risks & open calls

- **Email deliverability / cost** for anon reporters without email → tokenized status page is the fallback channel; don't hard-depend on SMS.
- **Resolution-photo staff burden** → canned notes + optional (not mandatory) photo to start; measure coverage, then tighten.
- **Migration discipline** → new schema follows the existing opt-in / NOT-auto-applied convention; keep flag-off insert paths byte-identical (as `007` does).
- **PII on public token pages** → opaque token, not sequential id; server-side EXIF strip; keep blur in the path.
- **`in_progress`/`merged`** → product call: wire them or drop them. Plan assumes wire (needed for honest timelines + dedup).
- **PostGIS zone polygons** → routing rules need real boundary data per city; MVP can ship category-only routing with a zone-FK nullable.

---

## 7. Issue register (52)

P0 loop: (1) `my-reports` → /login · (2) `my-reports/[id]` → /login · (3) no My-Reports nav tab · (4) notif skips `open` status · (5) `getCurrentResident` returns demo id when authed · (6) `_demoReporterId` global cache leak · (7) no resolution photo on close · (8) no tracking number on submit.

P1 multi-city/routes: (9) ViewSwitch hardcodes cumming · (10) submitReport Cumming geo/slug fallback mis-files · (11) staff silent Cumming default · (12) duplicate `/city/[slug]` vs `/[team]/[city]` · (13) city-switch orphans team context · (14) lockedTeam selector still clickable · (15) team-card click scopes panel only.

P1 data: (16) `resolvedThisWeek` uses created_at not resolved_at · (17) multiple `Date.now()` week-bucket drift · (18) synthetic notif `read` flag always-unread · (19) `pctChange` 0→1 = "100%" · (20) category sort no tie-break · (21) `fetchCityStats` zeros == quiet city · (22) `reporter_id` coerced to `""` · (23) `synthStageTimes` determinism undocumented · (24) notifications query no limit/city scope.

P2 states: (25) BottomTabBar absent pre-hydration → CLS · (26) no mock-vs-DB indicator · (27) map auto-redraw thrash, no Apply · (28) analytics pending dims grid only · (29) empty state doesn't name active filters · (30) custom date range from>to silent 0 · (31) shared loading skeleton shape mismatch · (32) commented Browse route confuses + overflows mobile nav.

P2 a11y: (33) modal no focus trap · (34) disabled button `text-zinc-600` fails AA · (35) color-only category dots no aria · (36) notif row `cursor:default` feels disabled · (37) upvote stopPropagation no affordance · (38) bare tab aria-labels · (39) redundant unread dot announce · (40) SSR/CSR `Date.now()` hydration risk · (41) timeline icon contrast unverified · (42) tag toggles <44px wrapped gap · (43) updates-popover vs ViewSwitch z-index collision.

P2 flow/admin: (44) rapid double-submit conflicting state · (45) low-confidence "Track" link to broken detail · (46) NotificationsFeed remount drops `readIds` · (47) staff poll cursor client-clock skew · (48) sidebar prefix-match wrong highlight · (49) no duplicate detection at file · (50) no per-category emergency deflection · (51) no SLA/`expected_datetime`/escalation · (52) public status taxonomy not Open311-aligned.

---

## 8. Sequencing (TL;DR)

**Phase 0 → 1** first: they restore the loop and ship the measured 60% lever, and almost everything else is polish on top. Then **2** (correctness, so metrics are trustworthy), **3** (multi-city + route dedup, removes architectural debt), **4** (admin depth), **5** (friction + a11y). Phases 2–5 are largely parallelizable once 0–1 land.

### Source index
Operational transparency: [M&SOM 2020](https://pubsonline.informs.org/doi/10.1287/msom.2020.0877), [HBS](https://www.library.hbs.edu/working-knowledge/how-government-can-restore-the-faith-of-citizens), [Labor Illusion / Mgmt Sci 2011](https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376) · Open311: [GeoReport v2](https://wiki.open311.org/GeoReport_v2/), [status enum #61](https://github.com/open311/open311.github.io/issues/61), [Extensions](https://wiki.open311.org/GeoReport_v2/Extensions/), [SeeClickFix ref impl](https://github.com/SeeClickFix/Open311), [FixMyStreet spec](https://github.com/mysociety/fixmystreet/wiki/Open311-FMS---Complete-Spec) · Notifications: [SeeClickFix status](https://www.civicplus.help/seeclickfix/docs/change-request-status), [GoGov](https://www.gogovapps.com/crm), [fatigue UX](https://www.smashingmagazine.com/2025/07/design-guidelines-better-notifications-ux/), [FixMyStreet FAQ](https://www.fixmystreet.com/faq) · Friction: [EXIF strip iOS](https://developer.apple.com/forums/thread/727451), [exifr](https://github.com/MikeKovarik/exifr), [duplicates 100 m](https://www.civicplus.help/seeclickfix/docs/mark-a-request-as-a-duplicate), [emergency deflection](https://fixmystreet.org/pro-manual/print/) · Admin: [GIS routing](https://catalisgov.com/public-works/gis-insights-help-311-teams-prioritize-resources/), [NYC SLA](https://data.cityofnewyork.us/City-Government/311-Service-Level-Agreements/cs9t-e3x8), [supercluster](https://www.npmjs.com/package/supercluster) · Standards: [§508/USWDS](https://www.section508.gov/develop/accessible-design-using-uswds/), [WCAG 2.1](https://www.w3.org/TR/WCAG21/)
