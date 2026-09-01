# Loading / error boundary coverage

**Summary:** 22 routes audited. 12 routes have async data-fetching (3+ DB queries or network calls). **10 critical gaps identified:** async routes missing error boundaries; 5 routes missing loading skeletons entirely. Top issue: `/[team]/[city]/*` dynamic route segment has zero boundaries despite async data-fetching + `params: Promise<>` destructuring.

---

## Findings Table

| Route | Async? | Has Loading | Has Error | Recommendation | Issue Citation |
|-------|--------|-------------|-----------|-----------------|-----------------|
| `/` | No (client-side globe fetch is Suspended) | no | no | CLEAN, Suspense fallback for async leaf component wraps slow fetch. | page.tsx:139-141 |
| `/login` | No (static form + client auth) | yes | no | **ADD error.tsx**. Auth errors (network, offline) should not crash. | page.tsx:1-12, loading.tsx present |
| `/report` | No (client-side form, blur + submit) | yes | no | CLEAN, form failures handled inline with try/catch + error state. Client-only. | page.tsx:1, "use client" |
| `/privacy` | No (static legal content) | no | no | CLEAN, pure HTML render, no data dependency. | page.tsx:1-19 |
| `/terms` | No (static legal content) | no | no | CLEAN, pure HTML render, no data dependency. | page.tsx:1-19 |
| `/staff` | **YES** (4 DB queries: getAuthUser + users + cities + getWorkOrders) | yes | no | **ADD error.tsx**, DB/RLS failures (permission, timeout) unhandled. High traffic route. | page.tsx:16-95; loading.tsx present |
| `/staff/settings` | No (static config data, hardcoded) | no | no | CLEAN, pure component, no fetching. | page.tsx:49-112 |
| `/staff/stats` | No (client-side FilterProvider, sync reuse) | yes | no | CLEAN, wrapped in Suspense with fallback skeleton. No async server data. | page.tsx:31-35 |
| `/staff/map` | **YES** (2 DB queries: fetchCity + fetchRecentReports) | yes | no | **ADD error.tsx**. FetchCity can throw notFound; fetchRecentReports can error silently. | page.tsx:8-14; loading.tsx present |
| `/user` | No (redirect only) | yes | no | CLEAN. Redirect is not async or data-fetching. Loading is pre-layout; acceptable. | page.tsx:1-7 |
| `/user/map` | No (sync corpus + FilterProvider) | no | no | CLEAN. No async calls; re-uses KNOWN_CITIES static data. | page.tsx:1-34 |
| `/user/pulse` | **YES** (1 DB query: getCurrentResident + getCityMorale, 2 awaits) | yes | no | **ADD error.tsx**. Resident lookup or morale fetch can error. | page.tsx:15-17; loading.tsx present |
| `/user/updates` | **YES** (2 DB queries: getCurrentResident + getResidentNotifications) | yes | no | **ADD error.tsx**. Notification fetch can timeout or error. | page.tsx:19-21; loading.tsx present |
| `/user/my-reports` | **YES** (2 DB queries: getCurrentResident + getMyReports) | no | no | **ADD loading.tsx, ADD error.tsx**, list page with non-trivial data fetch. Long page load is visible. | page.tsx:14-16 |
| `/user/my-reports/[reportId]` | **YES** (4 DB queries: getCurrentResident + getMyReport + getReportTimeline + notFound check) | no | no | **ADD loading.tsx, ADD error.tsx**, detail page with cascading async. Unhandled if report is invalid or fetch times out. | page.tsx:62-70; dynamic="force-dynamic" |
| `/city/[slug]` | **YES** (3 DB queries in generateMetadata, 2 in page: fetchCityFromDb + fetchCityMock fallback + fetchCityStats) | yes | no | **ADD error.tsx**, try/catch in generateMetadata swallows errors; page-level fallback is not surfaced to user on data error. | page.tsx:20-70; loading.tsx present |
| `/city/[slug]/browse` | **YES** (2 DB queries: fetchCity + fetchCityStats) | yes | no | **ADD error.tsx**. FetchCity can throw notFound inline. | page.tsx:13-19; loading.tsx present |
| `/city/[slug]/map` | **YES** (1 DB query: fetchCity) | yes | yes | GOOD, both boundaries present. Minimal data fetch but appropriately guarded. | page.tsx:11-15; loading.tsx, error.tsx present |
| `/city/[slug]/analytics` | **YES** (1 DB query: fetchCity in generateMetadata + page) | yes | yes | GOOD, both boundaries present. Matches map pattern. | page.tsx:29-33; loading.tsx, error.tsx present |
| `/[team]/[city]` | **YES** (isValidTeamId + KNOWN_CITIES lookup are sync; no DB, but awaiting params + conditional notFound) | no | no | **ADD loading.tsx, ADD error.tsx**. Dynamic params Promise pattern requires boundaries even for sync validation. User sees blank page if notFound() is triggered without visual feedback. | page.tsx:25-29; generateMetadata also awaits params |
| `/[team]/[city]/map` | **YES** (isValidTeamId + notFound + KNOWN_CITIES lookup) | no | no | **ADD loading.tsx, ADD error.tsx**, same as parent: awaiting params, notFound logic unguarded. | page.tsx:11-15 |
| `/[team]/[city]/analytics` | **YES** (isValidTeamId + notFound + KNOWN_CITIES lookup) | no | no | **ADD loading.tsx, ADD error.tsx**, same as parent: awaiting params, notFound logic unguarded. | page.tsx:25-29 |

---

## Critical Issues (Priority Order)

### 1. **`/[team]/[city]/*` segment has zero boundaries** HIGHEST PRIORITY
- All three routes under `/[team]/[city]` are **async** (they await `params: Promise<>`), validate dynamic segments, and call `notFound()` on invalid team/city.
- **No loading.tsx or error.tsx at any level**: route segment or parent layout.
- User navigates to `/[team]/[city]` with invalid params → `notFound()` triggers → blank page, no fallback UI.
- **Severity:** Medium (demo-only; team IDs are validated against hardcoded enum), but UX is poor.
- **Fix:** Add `src/app/[team]/[city]/loading.tsx` (skeleton mirroring `/city/[slug]/loading.tsx`) and `error.tsx` (reuse `/city/[slug]/error.tsx` pattern).

### 2. **Async routes missing error.tsx** (10 routes) HIGH PRIORITY
All these routes have async data-fetching but **no error boundary**:
- `/staff`: 4 DB queries, auth + RLS failures unhandled. High traffic. **Add error.tsx.**
- `/staff/map`: fetchCity can throw. **Add error.tsx.**
- `/user/pulse`: morale fetch unhandled. **Add error.tsx.**
- `/user/updates`: notifications can timeout. **Add error.tsx.**
- `/login`: auth errors should be caught, not crash the page. **Add error.tsx.**
- `/city/[slug]`: metadata try/catch masks errors from user on page load. **Add error.tsx.**
- `/city/[slug]/browse`: fetchCity notFound is unguarded. **Add error.tsx.**

**Pattern:** Use the existing `src/app/city/[slug]/map/error.tsx` or `analytics/error.tsx` as template (minimal, centered button to retry).

### 3. **Routes missing loading.tsx** (5 routes) MEDIUM PRIORITY
- `/user/my-reports`: fetches report list; no skeleton. Page is blank until data arrives.
- `/user/my-reports/[reportId]`: force-dynamic detail page; complex data fetch (report + timeline + steps). No loading UI.
- `/[team]/[city]`: no loading at route or parent level.
- `/[team]/[city]/map`: no loading at route or parent level.
- `/[team]/[city]/analytics`: no loading at route or parent level.

**Pattern:** Skeleton should match expected layout (list items, grid cards, or detail sections). See `src/app/city/[slug]/loading.tsx` for example.

---

## Routes Intentionally Without Boundaries (Verified Clean)

| Route | Reason |
|-------|--------|
| `/` | Suspense + fallback wraps async globe fetch. Async is isolated to one component. |
| `/report` | Client-side form (use client). Errors handled inline with state + try/catch. No server data. |
| `/privacy`, `/terms` | Static legal content, no fetching. |
| `/staff/settings` | Hardcoded config data, no fetching. |
| `/staff/stats` | Client-side only; reuses sync corpus from FilterProvider. Already wrapped in Suspense. |
| `/user/map` | Sync corpus, no async data-fetching. |
| `/user` | Redirect only, not a data-fetching page. |

---

## Summary Metrics

- **Total pages:** 22
- **Async pages:** 12
- **Pages with loading.tsx:** 12
- **Pages with error.tsx:** 2
- **Async pages with BOTH:** 2 (only `/city/[slug]/map` and `/city/[slug]/analytics`)
- **Async pages missing error.tsx:** 10
- **Async pages missing loading.tsx:** 5
- **Critical gaps:** `/[team]/[city]/*` segment (3 routes, zero boundaries)

---

## Recommendations

1. **Immediate (this sprint):**
   - Add `error.tsx` to `/staff`, `/staff/map`, `/login`. Highest traffic/visibility.
   - Add `loading.tsx` + `error.tsx` to `/[team]/[city]`, `/[team]/[city]/map`, `/[team]/[city]/analytics`.

2. **Short-term (next sprint):**
   - Add `error.tsx` to remaining async routes (`/city/[slug]`, `/city/[slug]/browse`, `/user/pulse`, `/user/updates`).
   - Add `loading.tsx` to `/user/my-reports` and `/user/my-reports/[reportId]`.

3. **Long-term:**
   - Consider a shared error boundary component for consistency (currently `/city/[slug]/map` and `/analytics` are identical; extract to `@/components/error-fallback.tsx`).
   - Document the rule: "Every async server component that awaits a DB query or network call must have `loading.tsx` and `error.tsx` at its route segment or a parent layout."
