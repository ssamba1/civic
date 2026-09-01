# Test Coverage & Strategy

**Current state:** 11 test files / 202 source files = 5.5% coverage (low).
**Risk:** Critical paths (auth, API endpoints, RLS) lack tests.

---

## Current Test Inventory

### Unit Tests (5 files: src/lib/)

1. **`src/lib/ai/gemini.test.ts`**
   - Tests: classifyPhoto (Gemini API integration)
   - Coverage: Happy path, fenced JSON fallback, validation errors
   - **Gap:** Rate limiting behavior, timeout handling

2. **`src/lib/ai/work-order-rules.test.ts`**
   - Tests: generateWorkOrder (pure function)
   - Coverage: All report categories, severity mapping
   - **Gap:** None (comprehensive for pure function)

3. **`src/lib/ai/classify-pipeline.test.ts`**
   - Tests: runClassifyPipeline (end-to-end with mocked Gemini/Supabase)
   - Coverage: Success path, Gemini failures, DB errors
   - **Gap:** Race conditions on async classify, missing report handling

4. **`src/lib/ai/reasoning-ai.test.ts`**
   - Tests: getReasoning (Gemini structured output)
   - Coverage: Cache hit/miss, template fallback, error handling
   - **Gap:** None (good coverage)

5. **`src/lib/image/sniff-mime.test.ts`**
   - Tests: sniffImageMime (magic-byte MIME detection)
   - Coverage: All supported types, invalid headers
   - **Gap:** None (comprehensive)

6. **`src/lib/ai/rate-limit.test.ts`**
   - Tests: checkRateLimit (sliding-window rate limiting)
   - Coverage: Allow/deny logic, window expiration
   - **Gap:** None (comprehensive)

7. **`src/lib/dashboard-queries.test.ts`**
   - Tests: fetchCityStats, fetchReports (mocked Supabase queries)
   - Coverage: No-throw contract, error handling
   - **Gap:** None (good coverage for DB error paths)

### E2E Tests (0 files)

No Playwright/Cypress tests. All manual testing.

**Risk:** High, public API contracts (Open311) untested.

---

## Critical Gaps (Must Add)

### G1: Open311 API Tests (3-4 hours)

**Why critical:**
- Public API contract
- Service-code filter broken (just fixed)
- Need regression test

**Tests to add:**

```typescript
// src/app/api/open311/v2/requests.test.ts (create)

describe("Open311 GET /requests", () => {
  // Existing: none

  // NEW TESTS:
  test("GET /requests filters by service_code correctly", async () => {
    // Setup: insert pothole + graffiti reports with classifications
    // Test: ?service_code=pothole returns ONLY pothole, not all reports
    // Assert: count == 1, category == "pothole"
  });

  test("GET /requests filters by jurisdiction_id", async () => {
    // Setup: insert reports in two cities
    // Test: ?jurisdiction_id=cumming returns only Cumming reports
    // Assert: all results have city_id matching Cumming
  });

  test("GET /requests filters by status", async () => {
    // Setup: insert open + closed reports
    // Test: ?status=closed returns only closed
    // Test: ?status=open returns only open
  });

  test("GET /requests respects pagination", async () => {
    // Setup: insert 150 reports
    // Test: ?page=1&page_size=100 returns first 100
    // Test: ?page=2&page_size=100 returns next 50
  });

  test("POST /requests validates api_key", async () => {
    // Test: invalid key returns 401
    // Test: missing key returns 401
    // Test: valid key returns 200
  });

  test("POST /requests validates lat/long", async () => {
    // Test: lat > 90 returns 400
    // Test: lng > 180 returns 400
    // Test: valid coords return 200
  });

  test("POST /requests rejects non-https media_url", async () => {
    // Test: http:// URL returns 400
    // Test: https:// URL accepted
  });

  test("POST /requests creates report and triggers classify", async () => {
    // Test: report inserted with correct reporter_id
    // Test: classification fetch triggered (or logged)
    // Assert: report status is 'open'
  });
});
```

**Effort:** 3-4 hours (setup test DB, mocks, assertions)

---

### G2: Auth & RLS Tests (4-6 hours)

**Why critical:**
- Auth enforcement affects data security
- RLS policies untested
- Staff role checks in actions.ts are only enforced by getStaffUser()

**Tests to add:**

```typescript
// src/app/staff/actions.test.ts (create)

describe("Staff actions auth", () => {
  test("dispatchWorkOrder requires staff role", async () => {
    // Setup: authenticated resident user
    // Call: dispatchWorkOrder(workOrderId)
    // Assert: returns { ok: false, error: "Unauthorized..." }
  });

  test("dispatchWorkOrder requires city match", async () => {
    // Setup: staff_dispatcher in city A
    // Setup: work order for city B
    // Call: dispatchWorkOrder(workOrderId)
    // Assert: returns { ok: false, error: "Unauthorized..." } (or no match)
  });

  test("closeWorkOrder fails if work_order doesn't exist (H2)", async () => {
    // Setup: report without work order
    // Call: closeWorkOrder(reportId) [using alternate function]
    // Assert: returns { ok: false, error: "work_order_not_found" }
  });

  test("dispatchWorkOrderForReport requires work order to exist", async () => {
    // Setup: report created, but no work order
    // Call: dispatchWorkOrderForReport(reportId)
    // Assert: returns error (not ok)
  });

  test("staff cannot update reports from other cities", async () => {
    // Setup: staff_dispatcher in city A
    // Setup: report in city B
    // Call: dispatchWorkOrderForReport(reportId)
    // Assert: should fail (RLS blocks it)
  });
});

// src/app/api/open311/v2/requests.test.ts
describe("Open311 auth", () => {
  test("POST /requests rejects invalid API key", async () => {
    // POST with api_key=wrong-key
    // Assert: 401 Unauthorized
  });

  test("POST /requests requires api_key", async () => {
    // POST with no api_key
    // Assert: 401 Unauthorized
  });

  test("GET /requests is public (no auth required)", async () => {
    // GET /requests without auth
    // Assert: 200 OK (public read)
  });
});
```

**Effort:** 4-6 hours (test DB setup, auth mocking, multiple roles)

---

### G3: Race Condition Tests (2 hours)

**Why critical:**
- dispatchWorkOrderForReport TOCTOU race (just fixed)
- Database transaction isolation

**Tests to add:**

```typescript
// src/app/staff/actions.test.ts

describe("Race conditions", () => {
  test("dispatchWorkOrder reads report_id in same query (no TOCTOU)", async () => {
    // Setup: work order + report
    // Call: dispatchWorkOrder(workOrderId)
    // Assert: report status changed to "dispatched" (single query = atomic)
  });

  test("dispatchWorkOrderForReport with missing work order", async () => {
    // This tests the fix from 08-fix-implementations.md
    // Setup: report created, no work order
    // Call: dispatchWorkOrderForReport(reportId)
    // Assert: returns { ok: false, error: "work_order_not_found" }
  });

  test("concurrent dispatches to same work order handled gracefully", async () => {
    // Simulate two staffers clicking dispatch at same time
    // Assert: first succeeds, second gets a graceful error (not orphaned state)
  });
});
```

**Effort:** 2 hours (concurrency testing setup)

---

### G4: Component State Management Tests (3 hours)

**Why critical:**
- Complex state (refs, callbacks, effects)
- Hydration mismatch in reducedMotion (just fixed)

**Tests to add:**

```typescript
// src/components/analytics/hover-tip.test.tsx (create)

import { renderHook, act } from "@testing-library/react";
import { useHoverTip } from "./hover-tip";

describe("useHoverTip", () => {
  test("Portal stabilizes after hydration", () => {
    // Render hook (simulates SSR + hydration)
    const { result } = renderHook(() => useHoverTip());

    // Before mounted: Portal reads reducedMotion() (returns false)
    // After effect: mounted = true, read actual window.matchMedia

    // Assert: Portal identity stable, no remount on subsequent renders
  });

  test("hovering updates position without remounting Portal", () => {
    const { result } = renderHook(() => useHoverTip());

    act(() => {
      result.current.show({ body: "Test" }, { clientX: 100, clientY: 200 });
      result.current.move({ clientX: 110, clientY: 210 });
    });

    // Assert: Portal NOT recreated during move (only state changed)
  });

  test("touch vs mouse behavior", () => {
    const { result } = renderHook(() => useHoverTip());

    const handlers = result.current.bindTarget({ body: "Test" });

    // Touch: should not show on enter, should toggle on click
    act(() => {
      handlers.onPointerEnter({ pointerType: "touch", clientX: 100, clientY: 100 });
    });
    // Assert: visible == false

    act(() => {
      handlers.onClick({});
    });
    // Assert: visible == true
  });
});

// src/components/analytics/hover-tip.test.tsx
describe("Hydration mismatch fix", () => {
  test("reducedMotion state matches server + client", () => {
    // Mock window.matchMedia to return false (no reduced-motion)
    // Render hook on "server" (jsdom with window mocked)
    // Render hook on "client" (jsdom with window available)
    // Assert: both return false initially, then sync to window value after effect
  });
});
```

**Effort:** 3 hours (React testing library setup, mocks)

---

## Test Infrastructure Setup

### Current

```bash
npm run test        # vitest (unit tests)
npm run test:watch # vitest --watch
npm run test:e2e   # playwright (currently no tests)
```

### Recommended Additions

```bash
npm run test:coverage  # Generate coverage report
npm run test:watch     # Watch mode for development
npm run ci:test        # CI: run all tests + coverage check
```

### Package.json Updates

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:debug": "playwright test --debug",
    "ci:test": "npm run test && npm run test:coverage && npm run test:e2e"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.0",  // ADD
    "@testing-library/jest-dom": "^6.0.0", // ADD
    "@vitest/coverage-v8": "^4.1.0",      // ADD for coverage reports
    "playwright": "^1.40.0"                // ADD if missing
  }
}
```

---

## Coverage Targets

### By Component Type

| Component | Current | Target | Effort |
|-----------|---------|--------|--------|
| API routes | 0% | 80% | 6-8 hrs |
| Server actions | 0% | 70% | 4-6 hrs |
| RLS/Auth | 0% | 90% | 4-6 hrs |
| Client components | 5% | 40% | 3-4 hrs |
| Pure functions (lib/) | 90% | 95% | 1-2 hrs |

### Total Effort

**Critical path (G1, G4):** 12-16 hours
**Full coverage (targets above):** 20-30 hours

### Recommendation

**Phase 1 (2-3 days):** G1, G4 (critical gaps)
**Phase 2 (1 week):** Expand to 60% overall coverage

---

## CI/CD Integration

### Add to `.github/workflows/ci.yml` (create if missing)

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:coverage
      - run: npm run test:e2e

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## Test Data Strategy

### Fixtures

Create `src/__tests__/fixtures.ts`:

```typescript
export const testUser = {
  resident: { id: "user-1", role: "resident", city_id: "city-1" },
  dispatcher: { id: "user-2", role: "staff_dispatcher", city_id: "city-1" },
  supervisor: { id: "user-3", role: "staff_supervisor", city_id: "city-1" },
  admin: { id: "user-4", role: "admin", city_id: "city-1" },
};

export const testCity = { id: "city-1", slug: "cumming", name: "Cumming, GA" };

export const testReport = {
  id: "report-1",
  city_id: testCity.id,
  reporter_id: testUser.resident.id,
  location: "SRID=4326;POINT(-84.14 34.20)",
  photo_public_url: "https://example.com/test.webp",
  status: "open",
};
```

---

## Conclusion

**Current test coverage is insufficient** for production. Critical paths (API, auth, RLS) are untested and should be prioritized.

**Recommendation:** Implement G1, G4 (12-16 hours) before next release. This covers the most high-risk areas and provides a regression suite for bug fixes.
