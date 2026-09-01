# Debug Cruft Audit: Detailed Findings

**Summary:** 23 console.* occurrences found across 14 files. **1 P0 finding (PII leakage in email logs)**. 14 P1 (fallback warnings + error logging should use logger). 3 intentional logger infrastructure (KEEP). 5 intentional error logging (KEEP, but consider migrating to logger for Sentry integration).

---

## Findings Table

| ID | file:line | severity | statement | context | assessment |
|----|-----------|-----------|-----------|---------|----|
| 1 | src/lib/notify/deliver.ts:76 | **P0** | `console.info(...${m.to}...)` | Logs recipient email when disabled | **REMOVE**, PII leakage; logs plaintext email address |
| 2 | src/lib/notify/deliver.ts:82 | **P0** | `console.info(...${m.to}...)` | Logs recipient email when no key | **REMOVE**, PII leakage; logs plaintext email address |
| 3 | src/app/report/actions.ts:212 | **P1** | `console.error("submit-report: classify backstop failed for ...", message, logErr)` | Async pipeline error fallback | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 4 | src/lib/analytics-data.ts:122 | **P1** | `console.warn("analytics-data: falling back to literals")` | Fallback after query error | **MIGRATE**. Use logger for consistent structured output |
| 5 | src/lib/analytics-data.ts:176 | **P1** | `console.warn("analytics-data: falling back to literals")` | Fallback after catch block | **MIGRATE**. Use logger for consistent structured output |
| 6 | src/lib/dashboard-data.ts:243 | **P1** | `console.warn("dashboard-data: falling back to placeholder city")` | Fallback after query error | **MIGRATE**. Use logger for consistent structured output |
| 7 | src/lib/dashboard-data.ts:250 | **P1** | `console.warn("dashboard-data: falling back to placeholder city")` | Fallback after catch block | **MIGRATE**. Use logger for consistent structured output |
| 8 | src/lib/resident-data.ts:295 | **P1** | `console.warn("resident-data: falling back to synthetic corpus")` | Fallback after auth check | **MIGRATE**. Use logger for consistent structured output |
| 9 | src/lib/resident-data.ts:310 | **P1** | `console.warn("resident-data: falling back to synthetic corpus")` | Fallback after query error | **MIGRATE**. Use logger for consistent structured output |
| 10 | src/lib/resident-data.ts:340 | **P1** | `console.warn("resident-data: falling back to synthetic corpus")` | Fallback after catch block | **MIGRATE**. Use logger for consistent structured output |
| 11 | src/lib/resident-data.ts:627 | **P1** | `console.warn("resident-data: falling back to synthetic corpus")` | Fallback for notifications | **MIGRATE**. Use logger for consistent structured output |
| 12 | src/lib/notify/deliver.ts:103 | **P1** | `console.error(\`[notify] resend ${res.status}: ...\`)` | Email send failure | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 13 | src/lib/notify/deliver.ts:108 | **P1** | `console.error(\`[notify] send threw: ...\`)` | Exception during send | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 14 | src/lib/notify/status-notify.ts:150 | **P1** | `console.error(\`[notify] composer threw for ${reportId}: ...\`)` | Unhandled exception in composer | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 15 | src/app/api/open311/v2/requests/route.ts:97 | **P1** | `console.error("Open311 requests query error:", error)` | GET query failure | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 16 | src/app/api/open311/v2/requests/route.ts:122 | **P1** | `console.error("Open311 GET /requests error:", err)` | GET catch handler | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 17 | src/app/api/open311/v2/requests/route.ts:268 | **P1** | `console.error("Open311 POST insert error:", insertError)` | POST insert failure | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 18 | src/app/api/open311/v2/requests/route.ts:313 | **P1** | `console.error("Open311 POST /requests error:", err)` | POST catch handler | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 19 | src/app/api/ai/classify/route.ts:86 | **P1** | `console.error("[classify] unhandled error:", err)` | POST catch handler | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 20 | src/app/api/ai/reasoning/route.ts:111 | **P1** | `console.error("[reasoning] unhandled error:", err)` | POST catch handler | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 21 | src/app/staff/layout.tsx:64 | **P1** | `console.error("[staff/layout] profile fetch failed:", error.message)` | Profile query error | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 22 | src/app/staff/page.tsx:53 | **P1** | `console.error("Failed to fetch work orders:", error.message)` | Work order query error | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| 23 | src/app/api/open311/v2/requests/[id]/route.ts:74 | **P1** | `console.error("Open311 GET /requests/[id] error:", err)` | GET catch handler | **MIGRATE**. Use logger for Sentry integration + correlation ID |
| K1 | src/lib/logger.ts:27 | KEEP | `console.error(entry)` | Logger abstraction emit() | Intentional; structured JSON to stderr |
| K2 | src/lib/logger.ts:29 | KEEP | `console.warn(entry)` | Logger abstraction emit() | Intentional; structured JSON to stderr |
| K3 | src/lib/logger.ts:31 | KEEP | `console.log(entry)` | Logger abstraction emit() | Intentional; structured JSON to stdout |

---

## Details: P0 Findings

### PII Leakage: Email Address Logged in Plaintext

**Files:** src/lib/notify/deliver.ts:76, 82

**Code excerpt:**
```typescript
// Line 76
if (process.env.NOTIFY_DISABLE === "1") {
  console.info(`[notify] (disabled) would email ${m.to}: ${m.subject}`);
  return { sent: false, reason: "disabled" };
}

// Line 82
if (!key) {
  console.info(`[notify] (no key) would email ${m.to}: ${m.subject}`);
  return { sent: false, reason: "no-key" };
}
```

**Why it matters:**
- Email addresses are PII; logging them violates privacy principles
- Logs may be persisted in development/staging environments without proper access controls
- Log aggregators, container stdout/stderr, and CI/CD may expose these logs
- "Disabled" logs are still logs. They will appear in production logs if the flag is not set

**Recommended fix:**
```typescript
// Option 1: Remove email entirely (preferred)
if (process.env.NOTIFY_DISABLE === "1") {
  console.info(`[notify] (disabled) notification suppressed`);
  return { sent: false, reason: "disabled" };
}

if (!key) {
  console.info(`[notify] (no key) notification not sent`);
  return { sent: false, reason: "no-key" };
}

// Option 2: Migrate to logger and don't include email
const logger = createLogger("[notify]");
logger.info("Notification disabled by environment");
logger.info("Notification not sent (no API key)");
```

---

## Details: P1 Findings (Logging Infrastructure Gaps)

### Why Migration to Logger.ts Matters

src/lib/logger.ts provides:
1. Structured JSON output (level, context, correlationId, timestamp, custom metadata)
2. Automatic Sentry integration with context tags + error capture
3. Correlation ID for tracing related events across logs
4. Structured metadata for log aggregation (CloudWatch, Datadog, etc.)

**Plain console.* bypasses all of this:**
- No correlation ID for tracing
- Unstructured format (harder to parse in log aggregators)
- No Sentry integration (errors not surfaced to ops)
- Cannot filter by context or severity in log dashboards

### Pattern: 8 Fallback Warnings (IDs 4-11)

**Current (unstructured):**
```typescript
// src/lib/resident-data.ts:295
try {
  const user = await getAuthUser();
  if (!user) {
    console.warn("resident-data: falling back to synthetic corpus");
    return myReportsFallback();
  }
  // ... query ...
} catch {
  console.warn("resident-data: falling back to synthetic corpus");
  return myReportsFallback();
}
```

**Recommended (structured):**
```typescript
import { createLogger } from "@/lib/logger";

const logger = createLogger("resident-data");

try {
  const user = await getAuthUser();
  if (!user) {
    logger.warn("Falling back to synthetic corpus (no auth)");
    return myReportsFallback();
  }
  // ... query ...
} catch (err) {
  logger.warn("Falling back to synthetic corpus", { error: err instanceof Error ? err.message : String(err) });
  return myReportsFallback();
}
```

Apply this pattern to all 8 fallback warnings:
- src/lib/analytics-data.ts:122, 176
- src/lib/dashboard-data.ts:243, 250
- src/lib/resident-data.ts:295, 310, 340, 627

### Pattern: 8 Error Logging (IDs 3, 12-23)

**Current (unstructured, no Sentry):**
```typescript
// src/app/api/open311/v2/requests/route.ts:97
if (error) {
  console.error("Open311 requests query error:", error);
  return errorResponse(500, "Database query failed", wantsXml);
}
```

**Recommended (Sentry + correlation ID):**
```typescript
import { createLogger } from "@/lib/logger";

const logger = createLogger("[open311-list]");

if (error) {
  logger.error("Database query failed", error);  // Sends to Sentry, includes correlationId
  return errorResponse(500, "Database query failed", wantsXml);
}
```

Apply to all error logging points:
- src/app/api/open311/v2/requests/route.ts:97, 122, 268, 313
- src/app/api/open311/v2/requests/[id]/route.ts:74
- src/app/api/ai/classify/route.ts:86
- src/app/api/ai/reasoning/route.ts:111
- src/lib/notify/deliver.ts:103, 108
- src/lib/notify/status-notify.ts:150
- src/app/staff/layout.tsx:64
- src/app/staff/page.tsx:53
- src/app/report/actions.ts:212

---

## Clean (No Issues Found)

- No `debugger` statements
- No `console.log()` debug statements (only info/warn/error)
- No `console.debug()` statements
- No `.only()` or `.skip()` in test files (11 test files scanned)
- No `if (true)` / `if (false)` dead code patterns
- No large commented-out code blocks
- No leftover test scaffolding
- Development flags properly gated:
  - `DEMO_MODE` (NEXT_PUBLIC_DEMO_MODE env var)
  - `ASYNC_CLASSIFY` (NEXT_PUBLIC_ASYNC_CLASSIFY env var)
  - `DEV_AUTH_BYPASS` (NODE_ENV === "development" only)

---

## Backlog (Ordered by Priority)

1. **Remove PII from email logs (P0, 2 occurrences)**
   - Files: src/lib/notify/deliver.ts:76, 82
   - Effort: ~5 min
   - Impact: Eliminates email address leakage from production logs

2. **Migrate all fallback warnings to logger (P1, 8 occurrences)**
   - Files: analytics-data.ts (2), dashboard-data.ts (2), resident-data.ts (4)
   - Pattern: Replace `console.warn(msg)` with `logger.warn(msg)` after adding `const logger = createLogger("context")`
   - Effort: ~20 min
   - Impact: Structured logging, easier log aggregation, correlation IDs

3. **Migrate all error logging to logger (P1, 10 occurrences)**
   - Files: open311 routes (5), AI routes (2), notify (3), staff (2)
   - Pattern: Replace `console.error(msg, err)` with `logger.error(msg, err)`
   - Effort: ~30 min
   - Impact: Sentry integration, correlation IDs, error aggregation

4. **Verify logger integration in production**
   - Confirm Sentry environment variable is set in Vercel deployments
   - Monitor that correlation IDs appear in Sentry dashboard
   - Test that fallback warnings and errors surface in logs

---

## Summary by Category

| Category | Count | Status | Priority |
|----------|-------|--------|----------|
| **PII in logs** | 2 | P0. Fix immediately | Critical |
| **Fallback warnings (unstructured)** | 8 | 🟠 P1, Migrate to logger | High |
| **Error logging (no Sentry)** | 10 | 🟠 P1, Migrate to logger | High |
| **Test scaffolding (.only/.skip)** | 0 | Clean | - |
| **Dead code (if true/false)** | 0 | Clean | - |
| **Commented-out code** | 0 | Clean | - |
| **Dev toggles (properly gated)** | 3 | Clean | - |
| **Intentional logger infra** | 3 | KEEP | - |

---

**Audit verdict:** 2 critical PII issues require immediate removal. 18 console statements should migrate to logger.ts for production observability (Sentry integration, correlation IDs, structured output). No dead code or test scaffolding found.
