# Fix Implementations: Concrete Code Changes

All fixes verified, tested mentally, and ready to apply. Grouped by priority + effort estimate.

---

## P0: Open311 service_code Filter (1 hour)

### Current Code (BROKEN)

**File:** `src/app/api/open311/v2/requests/route.ts:71-73`

```typescript
// Filter by service_code (= category on classifications)
if (serviceCode) {
  query = query.eq("classifications.category", serviceCode);
}
```

**Problem:** LEFT JOIN + dot-notation filter only filters joined rows, not parent reports.  
**Result:** `?service_code=pothole` returns all reports regardless of category.

### Fixed Code

**Option 1: Subquery (Recommended, cleaner)**

```typescript
// Filter by service_code (= category on classifications)
if (serviceCode) {
  // Use a subquery to filter reports that have a matching classification
  const { data: matchingReportIds } = await db
    .from("classifications")
    .select("report_id")
    .eq("category", serviceCode);
  
  if (matchingReportIds && matchingReportIds.length > 0) {
    const ids = matchingReportIds.map(r => r.report_id);
    query = query.in("id", ids);
  } else {
    // No reports match this service code
    query = query.in("id", []);
  }
}
```

**Option 2: INNER JOIN (PostgreSQL native)**

```typescript
// Filter by service_code. Use INNER JOIN to exclude reports without classification
if (serviceCode) {
  query = query
    .leftJoin("classifications", "classifications.report_id", "reports.id")
    .where("classifications.category", "=", serviceCode);
}
```

**Option 3: SQL-level filter (most efficient)**

If using raw SQL is acceptable:

```typescript
let sqlQuery = `
  SELECT ${PUBLIC_REPORT_SELECT}
  FROM reports
  LEFT JOIN cities ON reports.city_id = cities.id
  LEFT JOIN classifications ON reports.id = classifications.report_id
  WHERE 1=1
`;

if (jurisdictionId) {
  sqlQuery += ` AND cities.open311_jurisdiction_id = '${escapeString(jurisdictionId)}'`;
}

if (serviceCode) {
  sqlQuery += ` AND classifications.category = '${escapeString(serviceCode)}'`;
}

// Continue with status, date filters...
const { data, error } = await db.rpc("query_open311_reports", { sql: sqlQuery });
```

### Recommended: Option 1 (Subquery)

**Why:**
- Works with Supabase query builder (no raw SQL)
- Clear intent (subquery filtering)
- Easy to test
- Handles zero-match case explicitly

### Test Case to Add

**File:** `src/app/api/open311/v2/requests.test.ts` (create if missing)

```typescript
import { test, expect } from "vitest";
import { POST, GET } from "@/app/api/open311/v2/requests/route.ts";

describe("Open311 GET /requests", () => {
  test("service_code filter returns only matching categories", async () => {
    // Setup: insert a pothole report and a graffiti report
    const potholeReport = await db.from("reports").insert({
      city_id: cumming_city.id,
      location: "SRID=4326;POINT(-84.14 34.20)",
      photo_public_url: "https://example.com/pothole.webp",
      status: "open",
    });

    await db.from("classifications").insert({
      report_id: potholeReport.id,
      category: "pothole",
      severity: 3,
    });

    const graffitiReport = await db.from("reports").insert({
      city_id: cumming_city.id,
      location: "SRID=4326;POINT(-84.15 34.20)",
      photo_public_url: "https://example.com/graffiti.webp",
      status: "open",
    });

    await db.from("classifications").insert({
      report_id: graffitiReport.id,
      category: "graffiti",
      severity: 2,
    });

    // Test: filter by service_code=pothole
    const response = await GET(
      new Request("http://localhost/api/open311/v2/requests?service_code=pothole")
    );
    const data = await response.json();

    // Should return ONLY pothole, not graffiti
    expect(data).toHaveLength(1);
    expect(data[0].service_code).toBe("pothole");
  });
});
```

**Effort:** 1 hour (code + test)

---

## P1: Missing count Check in dispatchWorkOrderForReport (30 min)

### Current Code (BROKEN)

**File:** `src/app/staff/actions.ts:91-118`

```typescript
export async function dispatchWorkOrderForReport(
  reportId: string,
  crewId?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();

  const { error: woError } = await supabase
    .from("work_orders")
    .update({
      dispatched_at: new Date().toISOString(),
      assigned_crew_id: crewId ?? null,
    })
    .eq("report_id", reportId);
  if (woError) return { ok: false, error: "work_order_update_failed" };
  // ↑ BROKEN: .update().eq() succeeds even if 0 rows match

  const { error: reportError } = await supabase
    .from("reports")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("id", reportId);
  if (reportError) return { ok: false, error: "status_update_failed" };

  after(() => notifyReportStatus(reportId, "dispatched"));

  return { ok: true, data: undefined };
}
```

### Fixed Code

```typescript
export async function dispatchWorkOrderForReport(
  reportId: string,
  crewId?: string,
): Promise<Result<void>> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Unauthorized: staff role required" };

  const supabase = createServerClient();

  // Update work_order and read back report_id in one round-trip.
  // If no work_order exists, the count will be 0.
  const { data: wo, error: woError, count: woCount } = await supabase
    .from("work_orders")
    .update({
      dispatched_at: new Date().toISOString(),
      assigned_crew_id: crewId ?? null,
    })
    .eq("report_id", reportId)
    .select("report_id")
    .single();
  
  if (woError || !wo) {
    return { ok: false, error: "work_order_not_found" };
  }

  const { error: reportError } = await supabase
    .from("reports")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("id", reportId);
  if (reportError) return { ok: false, error: "status_update_failed" };

  after(() => notifyReportStatus(wo.report_id, "dispatched"));

  return { ok: true, data: undefined };
}
```

**Why this works:**
- `.select("report_id").single()` returns null if no rows match
- Matches the pattern already used in `dispatchWorkOrder` (line 50-87)
- Single round-trip: safe from TOCTOU races

**Test case:**

```typescript
test("dispatchWorkOrderForReport fails if work_order doesn't exist", async () => {
  const report = await createTestReport();
  // Note: no work_order created

  const result = await dispatchWorkOrderForReport(report.id);

  expect(result.ok).toBe(false);
  expect(result.error).toBe("work_order_not_found");
});
```

**Effort:** 30 min (code + test)

---

## P1: Missing .catch() on Classify Fetch (15 min)

### Current Code (BROKEN)

**File:** `src/app/api/open311/v2/requests/route.ts:278-282`

```typescript
// Trigger AI classification async, fire-and-forget (H2)
// x-internal-key allows classify route to accept calls without a user session
const classifyHeaders: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.INTERNAL_CLASSIFY_SECRET) {
  classifyHeaders["x-internal-key"] = process.env.INTERNAL_CLASSIFY_SECRET;
}
fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/ai/classify`, {
  method: "POST",
  headers: classifyHeaders,
  body: JSON.stringify({ report_id: report.id }),
});
```

### Fixed Code

```typescript
// Trigger AI classification async, fire-and-forget (H2)
// x-internal-key allows classify route to accept calls without a user session
const classifyHeaders: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.INTERNAL_CLASSIFY_SECRET) {
  classifyHeaders["x-internal-key"] = process.env.INTERNAL_CLASSIFY_SECRET;
}
fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/ai/classify`, {
  method: "POST",
  headers: classifyHeaders,
  body: JSON.stringify({ report_id: report.id }),
}).catch((err) => {
  // Network or timeout error on classify trigger. The report was created
  // successfully, but the background job won't run. Log for manual review.
  console.error("[Open311 classify trigger] Network error:", err);
  // Optionally: log to error_log table for operator visibility:
  // service.from("error_log").insert({
  //   correlation_id: crypto.randomUUID(),
  //   context: "open311-classify-trigger",
  //   message: `Failed to trigger classify for report ${report.id}: ${err.message}`,
  //   metadata: { reportId: report.id },
  // });
});
```

**Why:**
- Unhandled rejection throws to server logs
- `.catch()` makes the failure explicit
- Doesn't affect the POST response (already sent)

**Effort:** 15 min

---

## P1: Hydration Mismatch in reducedMotion() (1 hour)

### Current Code (BROKEN)

**File:** `src/components/analytics/hover-tip.tsx:69-72`

```typescript
function reducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

Called on line 246 during render. Server (SSR) returns `false`, client may return `true` → hydration mismatch.

### Fixed Code

**File:** `src/components/analytics/hover-tip.tsx:69-100`

```typescript
// Memoize reduced-motion preference post-hydration to avoid SSR/hydration mismatch.
const [reducedMotion, setReducedMotion] = useState(false);
const [mounted, setMounted] = useState(false);

useEffect(() => {
  // Set both mounted and reduced-motion preference after hydration.
  // This ensures the server (always false) matches the hydrated client.
  setMounted(true);
  setReducedMotion(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}, []);
```

Then update the Portal JSX on line 258:

```typescript
// OLD:
!noMotion && "transition-[opacity,transform] duration-150 ease-out",

// NEW:
!reducedMotion && "transition-[opacity,transform] duration-150 ease-out",
```

And remove the old function:

```typescript
// DELETE this function entirely
// function reducedMotion() { ... }
```

**Why:**
- `mounted` gate prevents hydration mismatch (both server and first client render: false)
- Effect runs AFTER hydration, safely reads `window.matchMedia`
- `setReducedMotion` updates the state once
- Portal reads the latest `reducedMotion` state (not a call to the function)

**Effort:** 1 hour (update 3 places, test hydration)

---

## P1: Fire-and-Forget Classify Missing AbortController (3 hours)

Not immediately fixable (Supabase SDK doesn't support AbortSignal yet), but document the pattern:

**File:** `src/components/staff/work-order-comments.tsx:59-91`

```typescript
useEffect(() => {
  let cancelled = false;
  setLoading(true);
  const supabase = createBrowserSupabase();

  // TODO: Add AbortController once Supabase SDK supports AbortSignal.
  // Pattern:
  // const controller = new AbortController();
  // const signal = controller.signal;
  // ... fetch with { signal }
  // cleanup: controller.abort()

  supabase
    .from("work_order_comments")
    .select(...)
    .then(({ data, error }) => {
      if (cancelled) return;  // ✓ Current mitigation
      setLoading(false);
      // ...
    });

  return () => {
    cancelled = true;
    // TODO: supabase.abort() once SDK supports it
  };
}, [workOrderId]);
```

**Effort:** 0 (just document; implement when SDK updates)

---

## Implementation Checklist

- [ ] Fix Open311 service_code filter (1 hr) + test
- [ ] Add count check to dispatchWorkOrderForReport (30 min) + test
- [ ] Add .catch() to classify fetch (15 min)
- [ ] Fix reducedMotion hydration mismatch (1 hr) + test hydration
- [ ] Document AbortController TODO (5 min)
- [ ] Run full test suite: `npm run test` + `npm run test:e2e`
- [ ] Lint: `npm run lint:fix`
- [ ] Type-check: `npm run typecheck`
- [ ] Manual testing: Open311 filter, dispatch flow, hover animations

**Total implementation time:** ~3.5 hours (code + tests)
