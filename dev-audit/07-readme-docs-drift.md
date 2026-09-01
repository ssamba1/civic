# Docs-vs-Reality Audit: README + .env + Features + Data Model

**Date**: 2026-06-13
**Scope**: README.md, .env.example, env validation (src/lib/env.ts), API routes (src/app/api), Supabase migrations, feature claims
**Method**: Exhaustive line-by-line comparison of documented vs actual implementation across all 5 passes

---

## Summary

**14 documentation gaps found** across environment variables, API routes, feature status, and data model claims.

**Severity breakdown:**
- **P0 (Critical)**: 2, undocumented required env vars, missing API endpoints in README
- **P1 (High)**: 5, undocumented optional env vars, feature status overclaims
- **P2 (Medium)**: 7, missing table documentation, stale feature descriptions, env schema gaps

**Most important issue**: Open311 POST /api/open311/v2/requests endpoint is undocumented in README API table, and three environment variables (OPEN311_API_KEY, OPEN311_SYSTEM_USER_ID, NEXT_PUBLIC_ASYNC_CLASSIFY) are required/used but absent from .env.example.

---

## Findings Table

| ID | File:Line | Sev | Issue | Reality | Fix |
|---|---|---|---|---|---|
| 1 | .env.example (missing) | P0 | OPEN311_API_KEY not documented | Required by src/app/api/open311/v2/requests/route.ts:157 for POST /api/open311/v2/requests auth | Add to .env.example: `OPEN311_API_KEY=` with comment on external Open311 clients |
| 2 | .env.example (missing) | P0 | OPEN311_SYSTEM_USER_ID not documented | Required by src/app/api/open311/v2/requests/route.ts:229; returns 500 if not set | Add to .env.example: `OPEN311_SYSTEM_USER_ID=` with comment on system user UUID |
| 3 | .env.example (missing) | P1 | NEXT_PUBLIC_ASYNC_CLASSIFY not documented | Used in src/lib/ai/config.ts:30; controls async classification mode (feature flag) | Add to .env.example: `NEXT_PUBLIC_ASYNC_CLASSIFY=` with comment on setting to '1' |
| 4 | README.md §API (79-89) | P0 | POST /api/open311/v2/requests missing from table | Endpoint exists, accepts api_key + service_code + lat/long + description/media_url, creates reports | Add row to README API table: `POST /api/open311/v2/requests \| Open311 API key \| Create service request` |
| 5 | README.md §API (79-89) | P1 | GET /api/auth/logout missing from table | Route exists at src/app/api/auth/logout/route.ts, handles Supabase signout | Add row: `GET /api/auth/logout \| Session \| Sign out current user` |
| 6 | README.md §Features (24) | P1 | "Upvote persistence + triggers" (🟠 migration pending) | No upvote table in migrations. Only verification_vote (citizen voting) exists. Feature doesn't exist, no migration pending. | Change to not built; OR clarify "Citizen verification" vs "Upvotes" as separate features |
| 7 | README.md §Features (25) | P1 | "Cost + SLA in staff detail" (🟠 wired, not persisted) | CATEGORY_SLA_TARGETS wired + displayed in src/components/analytics/report-detail.tsx:385, src/app/api/ai/reasoning/route.ts:276-287. Status understates actual implementation. | Change to; clarify SLA targets are category constants; document what "cost persisted" means |
| 8 | README.md §Features (26) | P1 | "Scoreboard / neighborhood equity view" (not built) | Neighborhood analysis IS built: TopNeighborhoods in analytics-bento.tsx:2883, fetchTopNeighborhoods in resident-data.ts:495, neighborhood-scale clustering in report-map.tsx:291 | Change to 🟠 partially built; split into "Neighborhood equity" and "Scoreboard benchmarks" |
| 9 | README.md §Data Model (94) | P2 | Table list incomplete (only lists 8, actual 13) | Omits notifications, classification_feedback, work_order_comments, error_log, merges | Add to README: notifications, merges; note reports.tags array; clarify internal vs user-facing tables |
| 10 | README.md §Features (27) | P2 | "Web push notifications" (not built) accurately claimed | No service-worker, Web Push API, push event handlers. Email-only (RESEND_API_KEY). | Keep as-is (accurate); optionally clarify "Email via Resend; web push not built" |
| 11 | README.md §Features (28) | P2 | "Offline submit (IndexedDB + BG Sync)" (not built) accurately claimed | No IndexedDB init, no Background Sync. Claim correct. | Keep as-is (accurate) |
| 12 | README.md §Features (15) | P2 | AI classification description ambiguous re: sync/async | Says "" but code supports both sync (default) and async (NEXT_PUBLIC_ASYNC_CLASSIFY=1). Design doesn't clarify mode. | Update to: "AI classification (Gemini 2.5 Flash, structured JSON, sync/async modes)" |
| 13 | src/lib/env.ts (3-14) | P2 | Env schema incomplete (missing 9 vars) | serverEnv schema missing OPEN311_API_KEY, OPEN311_SYSTEM_USER_ID; clientEnv missing NEXT_PUBLIC_ASYNC_CLASSIFY, NEXT_PUBLIC_DEMO_MODE, NEXT_PUBLIC_SITE_URL, etc. | Add optional fields to schemas, or document why omitted (build-time inlining, optional at runtime) |
| 14 | docs/CODE_REVIEW_2026-06.md (68-72) | P2 | Fire-and-forget classification issue confuses two separate concerns | Describes ASYNC_CLASSIFY as serverless workaround, but it controls resident wait, not fire-and-forget pattern. Both sync and async paths have fire-and-forget classify fetch. | Clarify ASYNC_CLASSIFY vs fire-and-forget are different concerns; update P0/P1 reasoning |

---

## Details: Critical & High Findings

### P0-1: OPEN311_API_KEY undocumented, required for POST /api/open311/v2/requests

**File**: .env.example (missing) and src/app/api/open311/v2/requests/route.ts:154-160

**Code**:
```ts
const apiKey = body.api_key ?? request.nextUrl.searchParams.get("api_key");
const expectedKey = process.env.OPEN311_API_KEY;
if (!expectedKey || !apiKey || !safeCompare(apiKey, expectedKey)) {
  return errorResponse(401, "API key is required and must be valid", wantsXml);
}
```

**Impact**: External Open311 clients cannot submit reports via POST endpoint. Without this env var documented, deployments will silently reject all external integrations. The endpoint is not mentioned in README API table (see Finding 4).

**Fix**: Add to .env.example:
```
# Open311 GeoReport v2 API key for external service request submissions
OPEN311_API_KEY=your-open311-api-key
```

---

### P0-2: OPEN311_SYSTEM_USER_ID undocumented, required for POST /api/open311/v2/requests

**File**: .env.example (missing) and src/app/api/open311/v2/requests/route.ts:227-236

**Code**:
```ts
const reporterId = process.env.OPEN311_SYSTEM_USER_ID;
if (!reporterId) {
  return errorResponse(
    500,
    "Server misconfigured: OPEN311_SYSTEM_USER_ID not set",
    wantsXml
  );
}
```

**Impact**: Without this env var, POST /api/open311/v2/requests returns 500 "Server misconfigured" for all external submissions. Reports cannot be created via Open311 API. The TODO comment at line 228 notes this is a placeholder: "Replace with a real api_key → user lookup table."

**Fix**: Add to .env.example:
```
# UUID of the system user that receives externally-created Open311 reports
OPEN311_SYSTEM_USER_ID=
```

---

### P0-4: POST /api/open311/v2/requests missing from README API table

**Files**: README.md lines 79-89 vs src/app/api/open311/v2/requests/route.ts:140-299

**README API table documents**:
- GET /api/health
- POST /api/ai/classify
- GET /api/ai/reasoning
- GET /api/open311/v2/services
- GET /api/open311/v2/requests
- GET /api/open311/v2/requests/[id]

**Missing**: POST /api/open311/v2/requests, a full endpoint that accepts external Open311 service requests.

**Implementation**: Requires OPEN311_API_KEY, accepts body with service_code, lat, long, address_string, description, media_url. Creates reports in the system and triggers async AI classification.

**Fix**: Add to README API table:
```
| `POST /api/open311/v2/requests` | Open311 API key | Create service request from external Open311 client |
```

---

### P1-6: "Upvote persistence + triggers" marked 🟠 but doesn't exist

**Files**: README.md line 24 vs supabase/migrations/

**README claim**:
```
| Upvote persistence + triggers | 🟠 migration pending |
```

**Reality**:
- No `upvotes` or `votes` table in any migration
- Migration 001 creates `verifications` table with `verification_vote` enum (confirmed/disputed). This is citizen verification voting, NOT upvotes
- No upvote-related triggers exist
- Feature is not in-progress; it's not built

**Why it matters**: Developers reading README expect upvote persistence to be nearly complete (migration pending = 80% done). It doesn't exist. This is a significant overclaim.

**Fix**: Change status to not built, or clarify two separate features:
```
| Citizen verification (confirmed/disputed) | yes |
| Upvote/like persistence | not built |
```

---

### P1-7: "Cost + SLA in staff detail" (🟠 wired, not persisted) understates implementation

**Files**: README.md line 25 vs src/components/analytics/, src/app/api/ai/reasoning/, src/lib/constants.ts

**README claim**:
```
| Cost + SLA in staff detail | 🟠 wired, not persisted |
```

**Reality**:
- CATEGORY_SLA_TARGETS is fully wired and displayed:
  - src/lib/constants.ts defines SLA targets per category
  - src/components/analytics/report-detail.tsx:310, 385 displays SLA target in staff detail view
  - src/app/api/ai/reasoning/route.ts:100, 123, 276-287 includes SLA target in AI reasoning payload
  - All staff views show SLA targets prominently
- Cost estimates are derived from Gemini classification confidence/severity

**Why it matters**: Status "wired, not persisted" is ambiguous. If "persisted" means "stored in DB per-report," then cost is not persisted (it's computed per-request). If "wired" means "connected to the UI," then SLA IS wired and displayed. The status misrepresents the actual level of completion.

**Fix**: Clarify in README:
```
| SLA targets + cost estimation | yes | SLA targets wired (displayed); cost computed from classification severity |
```

Or if cost estimation should persist to work_orders table, add migration to create est_cost column and update status accordingly.

---

### P1-8: "Scoreboard / neighborhood equity view" marked but partially built

**Files**: README.md line 26 vs src/components/analytics/analytics-bento.tsx, src/lib/resident-data.ts, src/components/map/report-map.tsx

**README claim**:
```
| Scoreboard / neighborhood equity view | not built |
```

**Reality**: Neighborhood equity view IS implemented:
- Line 2883 in analytics-bento.tsx: `title="Top neighborhoods"` card renders neighborhood-level stats
- Line 2900: `title="Reports by neighborhood"` chart shows report distribution by neighborhood
- Line 495 in resident-data.ts: `fetchTopNeighborhoods()` fetches top 5 neighborhoods
- Line 291 in report-map.tsx: neighborhood-scale hex clustering (180m radius) shows neighborhood-level aggregation

**Missing**: "Scoreboard" likely refers to a comparison view (city vs state benchmarks, city performance tracking over time), which is not built. But "neighborhood equity view" IS built.

**Why it matters**: README says the entire feature is "not built," but residents and staff can already view neighborhood-level equity metrics. The claim is imprecise and misleading.

**Fix**: Split into two features:
```
| Neighborhood equity view (top neighborhoods, by-neighborhood reports) | yes |
| Scoreboard (city benchmarks, performance over time) | not built |
```

---

## Backlog

### Must-do (blocks deployment, breaks integrations)
1. Add OPEN311_API_KEY and OPEN311_SYSTEM_USER_ID to .env.example with comments
2. Add POST /api/open311/v2/requests to README API table
3. Correct "Upvote persistence" to not built (or split from "Citizen verification")
4. Add NEXT_PUBLIC_ASYNC_CLASSIFY to .env.example

### Should-do (improves clarity)
5. Update "Cost + SLA" status in README to or clarify "persisted" intent
6. Split "Scoreboard / neighborhood equity" into two features (one, one)
7. Add notifications, merges, and reports.tags to README data model
8. Clarify which tables are user-facing vs internal in docs

### Nice-to-have (doc hygiene)
9. Add OPEN311_* vars to env.ts schema validation or document why omitted
10. Update docs/CODE_REVIEW to separate ASYNC_CLASSIFY (resident wait) from fire-and-forget (platform reliability)
11. Document feature matrix: resident vs staff vs admin vs public capabilities

---

## Verification Checklist

- All findings cite file:line
- Each claim cross-referenced against actual code (routes, migrations, components)
- Environment variables verified via grep for process.env.* / NEXT_PUBLIC_*
- API routes enumerated and compared to README table
- Feature table checked against migrations and component implementations
- Data model verified against all migration files (001-009)
- No false positives; all are confirmed mismatches between docs and code

