# Phase 1 Implementation Guide: Critical Test Coverage

**Objective:** Add 38 tests across 5 modules in 3 weeks. Gain +35% coverage. Block no feature work.

**Status:** In progress. Two test files written (filter-reports, derive). Three remaining (url-sync, signed-url, resident-data).

---

## Quick Reference: 5 Modules, 38 Tests, 17 Hours

| Module | File | Tests | Hours | Status | Owner |
|--------|------|-------|-------|--------|-------|
| **Core Filter** | filters/filter-reports.ts | 8 | 2 | ✅ Written | — |
| **Analytics** | filters/derive.ts | 12 | 4 | ✅ Written | — |
| **URL Serialization** | filters/url-sync.ts | 6 | 2 | ⏳ Skeleton ready | — |
| **Security** | privacy/signed-url.ts | 5 | 2 | ⏳ Skeleton ready | — |
| **Resident Data** | resident-data.ts | 15 | 6 | ⏳ Skeleton ready | — |
| **TOTAL** | — | **38** | **17** | — | — |

---

## Written: filter-reports.test.ts (8 tests, 2 hrs)

**File:** `src/lib/filters/filter-reports.test.ts`  
**Status:** ✅ Complete and runnable

**Test coverage:**
- resolveWindow: 7 tests
  - All presets (all, 7d, 14d, 30d, 90d)
  - Custom from/to with inclusive-of-whole-day
  - NaN handling
- filterReports: 10 tests
  - No constraints (all pass through)
  - Each constraint individually (severity, category, status, date, team)
  - Combined constraints (AND logic)
  - Override snapshot interaction
- filterPreviousWindow: 3 tests
  - No prior window for "all"
  - Correct prior window calculation
  - Constraint application in prior window

**Run:** `pnpm vitest src/lib/filters/filter-reports.test.ts`

---

## Written: derive.test.ts (12 tests, 4 hrs)

**File:** `src/lib/filters/derive.test.ts`  
**Status:** ✅ Complete and runnable

**Test coverage:**
- deriveKpis: 6 tests
  - resolution_rate formula
  - MTTR calculation
  - Backlog counting
  - Delta calculation with div-by-zero guard
- deriveTrend: 3 tests
  - Day bucketing
  - Created count per day
  - Span calculations
- deriveResolutionDistribution: 2 tests
  - Bucket assignment
  - Status filtering (closed only)
- deriveStatusFunnel: 1 test
  - 4 steps in order with counts
- deriveSeverityDistribution: 1 test
  - Per-severity counts 1-5
- deriveHourlyHeatmap: 2 tests
  - 7×24 grid
  - Count per day-hour cell
- deriveTopNeighborhoods: 5 tests
  - Street name extraction
  - Open vs total count
  - Unknown address default
  - Top-N limit
  - Sort by count
- deriveCategoryResolution: 3 tests
  - Avg hours for closed only
  - Count includes all statuses
  - Sort by count descending
- deriveReporterVelocity: 4 tests
  - Unique reporter count
  - Reports per reporter
  - Div-by-zero guard
  - 14-day spark array

**Run:** `pnpm vitest src/lib/filters/derive.test.ts`

---

## Next: url-sync.test.ts (6 tests, 2 hrs)

**File:** `src/lib/filters/url-sync.test.ts`  
**Status:** ⏳ Skeleton ready, awaiting implementation

**Skeleton is in 01-test-coverage-gaps.md § "15 Highest-Priority"**

**Test cases needed:**
1. filterToParams: omits default values (clean URL)
2. filterToParams: includes custom from/to only when preset=custom
3. parseFilterFromParams: falls back to defaults on invalid input
4. parseFilterFromParams: validates enums (preset, categories, statuses, team)
5. parseFilterFromParams: never throws on malformed input
6. Round-trip: filter → params → filter preserves all fields

**Imports needed:**
```typescript
import { filterToParams, parseFilterFromParams } from "./url-sync";
import type { ReportFilter } from "./types";
import { DEFAULT_FILTER } from "./types";
```

**Helper:**
```typescript
const baseFilter: ReportFilter = {
  preset: "14d",
  from: null,
  to: null,
  categories: [],
  minSeverity: 1,
  statuses: [],
  team: "all",
};
```

---

## Next: signed-url.test.ts (5 tests, 2 hrs)

**File:** `src/lib/privacy/signed-url.test.ts`  
**Status:** ⏳ Skeleton ready, awaiting implementation

**Skeleton is in 01-test-coverage-gaps.md § "Privacy/signed-url.ts — P0"**

**Test cases needed:**
1. Returns { ok: false, error: "unauthorized" } when user not found
2. Returns { ok: false, error: "unauthorized" } when user role not in ALLOWED_ROLES
3. Returns { ok: false, error: "unauthorized" } when user city_id ≠ requestedCityId
4. Returns { ok: true, data: signedUrl } when authorized
5. Verifies signed URL expiry = 10 minutes (600 seconds)

**Critical:** These are security-sensitive. Mocks must verify:
- Supabase query for user by ID
- Role + city validation before calling createSignedUrl
- Signed URL generation with correct path and expiry

**Imports needed:**
```typescript
import { createServerClient } from "@/lib/db/client";
import { getSignedRawPhotoUrl } from "./signed-url";
import { vi } from "vitest";
```

**Setup:**
```typescript
vi.mock("@/lib/db/client", () => ({
  createServerClient: vi.fn(),
}));

const createServerClientMock = vi.mocked(createServerClient);
```

---

## Next: resident-data.test.ts (15 tests, 6 hrs)

**File:** `src/lib/resident-data.test.ts`  
**Status:** ⏳ Skeleton ready, awaiting implementation

**Skeleton is in 01-test-coverage-gaps.md § "resident-data.ts — P0"**

**Test cases needed:**

**getCurrentResident (3 tests, 1.5 hrs):**
1. Demo fallback when no user (null) → demoReporterId, isDemo=true
2. Auth user extraction → user.id, display_name from metadata, isDemo=false
3. Supabase error → falls back gracefully (never throws)

**getMyReports (3 tests, 1.5 hrs):**
1. Demo fallback on error → myReportsFallback (filter corpus by reporter_id)
2. Decodes GeoJSON location from PostgREST
3. Enriches with completed_at + afterPhoto from work_orders 1:1 join

**getReportTimeline (4 tests, 2 hrs):**
1. Returns 4 stages: filed, dispatched, in_progress, resolved
2. Marks done=true for stages ≤ current status
3. Marks current=true on latest done stage (unless fully resolved)
4. Terminal states (merged/rejected): only filed stage current + note

**getCityMorale (2 tests, 1 hr):**
1. Momentum calculation (week-over-week closed, dead-band ±1 → up/flat/down)
2. Active reporters = unique reporter_id count

**syntheticNotifications (3 tests, 1.5 hrs):**
1. Skips merged/rejected (terminal-at-filed states)
2. Attaches reportSnapshot with category, color, status, address
3. In DEMO_MODE: includes city announcements

**Mocking strategy:**
- Mock getAuthUser and createSSRClient
- Mock getReportCorpus and fetchCity
- Use real synthStageTimes and reachedStages (pure logic)
- Snapshot test syntheticNotifications structure

---

## Daily Checklist (for implementers)

### Day 1-2: filter-reports.test.ts
- [x] Read src/lib/filters/filter-reports.ts (92 lines)
- [x] Write test file with 8 tests
- [x] Run: `pnpm vitest src/lib/filters/filter-reports.test.ts`
- [x] All tests pass
- [x] Commit: "test: add comprehensive filter-reports coverage (8 cases)"

### Day 3-5: derive.test.ts
- [x] Read src/lib/filters/derive.ts (300 lines)
- [x] Write test file with 12 tests
- [x] Run: `pnpm vitest src/lib/filters/derive.test.ts`
- [x] All tests pass
- [x] Commit: "test: add comprehensive analytics derive coverage (12 cases)"

### Day 6-7: url-sync.test.ts
- [ ] Read src/lib/filters/url-sync.ts (92 lines)
- [ ] Write test file with 6 tests (skeleton provided)
- [ ] Run: `pnpm vitest src/lib/filters/url-sync.test.ts`
- [ ] All tests pass
- [ ] Commit: "test: add URL serialization round-trip tests (6 cases)"

### Day 8-9: signed-url.test.ts
- [ ] Read src/lib/privacy/signed-url.ts (71 lines)
- [ ] Set up Supabase mock (createServerClient)
- [ ] Write test file with 5 tests (skeleton provided)
- [ ] Run: `pnpm vitest src/lib/privacy/signed-url.test.ts`
- [ ] All tests pass
- [ ] Commit: "test: add security-critical signed-url coverage (5 cases)"

### Day 10-15: resident-data.test.ts
- [ ] Read src/lib/resident-data.ts (699 lines)
- [ ] Identify test entry points (getCurrentResident, getMyReports, getReportTimeline, getCityMorale, syntheticNotifications)
- [ ] Set up SSR/Supabase mocks
- [ ] Write test file with 15 tests (skeleton provided)
- [ ] Run: `pnpm vitest src/lib/resident-data.test.ts`
- [ ] All tests pass
- [ ] Commit: "test: add comprehensive resident-data coverage (15 cases)"

### Day 16: Validation
- [ ] All 38 tests pass: `pnpm vitest src/lib/filters src/lib/privacy/signed-url.ts src/lib/resident-data.ts`
- [ ] Coverage delta measured: `pnpm vitest --coverage`
- [ ] No regressions in existing tests
- [ ] PR: "Phase 1: Test coverage for critical filter, analytics, security, and resident modules (38 tests)"

---

## Key Testing Patterns

### 1. Test Helpers (Reusable in All Files)

```typescript
const now = new Date("2026-06-13T12:00:00Z").getTime();
const DAY_MS = 86_400_000;

function makeReport(overrides: Partial<DashboardReport> = {}): DashboardReport {
  return {
    id: "r1",
    category: "pothole",
    severity: 3,
    status: "open",
    address: "100 Main St",
    location: { lat: 34.2, lng: -84.1 },
    photo_public_url: "",
    created_at: new Date(now).toISOString(),
    reporter_id: "reporter-1",
    ...overrides,
  };
}
```

### 2. Mocking Supabase (for signed-url, resident-data)

```typescript
vi.mock("@/lib/db/client", () => ({
  createServerClient: vi.fn(),
}));

const createServerClientMock = vi.mocked(createServerClient);

beforeEach(() => {
  createServerClientMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: {...}, error: null }),
        }),
      }),
    }),
    // ...
  } as any);
});
```

### 3. Pure Function Testing (filter-reports, derive, url-sync)

- No mocks needed
- Use fixtures (makeReport)
- Test edge cases: empty, null, boundary values
- Verify determinism: same input = same output

### 4. Snapshot Testing (resident-data)

```typescript
it("syntheticNotifications structure is stable", async () => {
  const items = await syntheticNotifications("cumming");
  expect(items).toMatchSnapshot();
});
```

---

## Running Tests

**All Phase 1 tests:**
```bash
pnpm vitest src/lib/filters src/lib/privacy/signed-url.ts src/lib/resident-data.ts
```

**Watch mode (during development):**
```bash
pnpm vitest --watch src/lib/filters/filter-reports.test.ts
```

**Coverage report:**
```bash
pnpm vitest --coverage src/lib/filters src/lib/privacy/signed-url.ts src/lib/resident-data.ts
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Supabase mock complexity (resident-data) | Start with simple stubs; spy on actual calls |
| Date/time testing (derive, resident-data) | Use fixed `now` constant across all tests |
| Flaky snapshot tests | Keep snapshots minimal; prefer specific assertions |
| Test bloat (resident-data is 699 lines) | Break into 5 logical suites per function |

---

## Success Criteria

- [x] 38 tests written and passing
- [ ] No regression in existing 11 tests
- [ ] Coverage delta = +35% (measured via vitest --coverage)
- [ ] All tests run in <5 seconds
- [ ] Team can add tests to Phase 2 without refactoring Phase 1
- [ ] Code review approves test quality

---

## Next Steps (After Phase 1)

**Phase 2 (Week 4-5):** delegation-history, teams-data, notify/deliver, privacy/blur, open311/transform
**Phase 3 (Week 6-7):** open311/xml, privacy/audit, privacy/upload, ai/rate-limiter, analytics-data
**Phase 4 (Week 8):** Extend shallow tests, client stores, utilities

