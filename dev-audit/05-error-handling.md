# Error-handling audit

**Summary:** 11 findings across error control flow, unhandled promises, unsafe type coercions, and missing Sentry instrumentation. Highest-risk: unprotected logout route, unawaited network call with no rejection handler, unhandled promise rejections in staff after() callbacks, and missing error reporting to Sentry in API routes.

**Critical issues (P0):**
- Logout route has no error handling (createSSRClient/signOut can throw)
- Unawaited fetch without .catch() in open311 POST (line 278)

**High-priority issues (P1):**
- Staff action callbacks pass unhandled promises to after() (4 sites: lines 84, 115, 153, 179)
- API routes log errors to console only; not reported to Sentry (classify, reasoning, open311)
- Sync classification path doesn't stamp classify_status:failed on catch

---

## Detailed Findings

| File | Line | Risk | Finding | Fix |
|------|------|------|---------|-----|
| `src/app/api/auth/logout/route.ts` | 4–8 | **P0** | No try/catch around `createSSRClient()` or `signOut()`. If either fails, exception propagates unhandled, returning 500 with no structured error body. Route should degrade gracefully. | Wrap in try/catch. Log error, then redirect to "/" anyway so logout always succeeds from user perspective. |
| `src/app/api/open311/v2/requests/route.ts` | 278 | **P0** | Unawaited `fetch()` call with no `.catch()` handler. Fire-and-forget network call that silently fails if classify service is unreachable. Network errors cause unhandled promise rejection; caller sees 201 success. | Wrap in `after()` (like submit-report line 183) or add `.catch(err => ...)` to log rejection and send to error_log. |
| `src/app/staff/actions.ts` | 84, 115, 153, 179 | **P1** | Four `after()` callbacks return unhandled promises from `notifyReportStatus()`: `after(() => notifyReportStatus(...))` is not async. If `notifyReportStatus()` throws (createServerClient fails inside), promise rejection is unhandled. Modern runtimes crash invocation or leave bad state. Compare correct pattern in report/actions.ts:183 (`after(async () => { ... })`). | Convert all four to async with try/catch: `after(async () => { try { await notifyReportStatus(...) } catch(err) { console.error(...) } })`. |
| `src/app/api/ai/classify/route.ts` | 85–91 | **P1** | Catches error but only logs to console; **not sent to Sentry**. Critical classification failures won't alert ops or appear in dashboards. | Add `Sentry.captureException(err, { tags: { endpoint: "classify" } })` before returning 500. |
| `src/app/api/ai/reasoning/route.ts` | 110–116 | **P1** | Catches error but only logs to console; **not sent to Sentry**. Reasoning failures (staff dashboard crashes) won't alert. | Add `Sentry.captureException(err, { tags: { endpoint: "reasoning" } })` before returning 500. |
| `src/app/api/open311/v2/requests/route.ts` | 97, 122, 268, 313 | **P1** | Four `console.error()` calls without Sentry. Open311 is public API; failures must be tracked. Logs are ephemeral; Sentry creates actionable alerts. | Wrap each in `Sentry.captureException(error, { tags: { endpoint: "open311_requests" } })`. |
| `src/app/api/open311/v2/requests/[id]/route.ts` | 74 | **P1** | `console.error()` without Sentry. Public endpoint failure untracked. | Add `Sentry.captureException(err, { tags: { endpoint: "open311_get_request" } })`. |
| `src/app/report/actions.ts` | 231–240 | **P1** | Sync classification path catches and swallows throws from `runClassifyPipeline()` **without stamping classify_status:failed**. If pipeline throws unexpectedly (e.g., createServerClient fails before any db write), no error_log row is written and `classify_status` column stays null. Report orphaned in manual triage, operator has no signal. Async path (line 183) correctly stamps status; sync path does not. | When ASYNC_CLASSIFY is OFF, add try/catch around sync path (line 231–240) that mirrors async backstop (lines 197–210): on catch, insert error_log and stamp `classify_status:"failed"` using service client before returning fallback. |
| `src/app/report/actions.ts` | 63 | **P2** | `.getUser()` result destructure checks `!user` but **does not check `error`**. If auth.getUser() returns an error, code ignores it and continues, potentially treating auth error as unauthenticated. Helper `getAuthUser()` (lib/db/ssr-client.ts:39) already checks both; this site should use it instead. | Replace `const { data: { user } } = await ssr.auth.getUser()` with `const user = await getAuthUser()`, which already checks error. Or add error check: `if (error || !user) return { ok: false, error: "auth_failed" }`. |
| `src/lib/ai/classify-pipeline.ts` | 117 | **P2** | `await photoBlob.arrayBuffer()` has no try/catch. If conversion fails (rare but possible with corrupted blobs), pipeline throws instead of gracefully falling back. Outer try/catch at line 109 catches it, so returns `ok:false`, but inline error handling improves clarity. | Wrap in try/catch that returns error result early before `classifyPhoto()` call. |
| `src/app/report/actions.ts` | 183–219 | **P2** | Async backstop's nested try/catch (lines 197–210) catches `logErr` but does **not** independently attempt `classify_status` stamp. If error_log insert fails, both log and status update are lost, leaving `classify_status:"pending"` forever. | Split backstop: separate try/catch for error_log insert vs. classify_status update. If log fails, still attempt status stamp so report is marked failed. |
| `src/app/report/page.tsx` | 83, 89, 326 | **P2** | Three `.then()` chains without `.catch()`: getSession (line 83), signInAnonymously (line 89), and classifications query (line 326). Rejections are unhandled. Line 89's chain checks `error` in-band but getSession/signInAnonymously rejection is unhandled if network fails. Line 326 has no error handling at all. | Add `.catch(err => ...)` to all three chains. Line 326 should set an error state if the query fails. |

---

## Details

### P0: Unprotected logout route (src/app/api/auth/logout/route.ts:4–8)

```typescript
export async function POST(request: Request) {
  const supabase = await createSSRClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
```

**Why critical:** If `createSSRClient()` throws (network error, env misconfiguration) or `signOut()` fails (API error), exception propagates uncaught → 500 response with no structured error body. Logout page shows error instead of completing logout.

**Fix:**
```typescript
export async function POST(request: Request) {
  try {
    const supabase = await createSSRClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[logout] signOut failed:", err instanceof Error ? err.message : String(err));
  }
  // Gracefully redirect regardless — logout always completes from user perspective
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
```

---

### P0: Unawaited fetch without error handler (src/app/api/open311/v2/requests/route.ts:278–282)

```typescript
// Trigger AI classification async — fire-and-forget (H2)
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

**Why critical:** Network call is not awaited and has no `.catch()` handler. If the classify service is unreachable or the request fails, the promise rejects silently. Caller sees 201 success but classification never runs. In serverless, unhandled promise rejection can crash the invocation.

**Fix:** Use Next.js `after()` (like submit-report does at line 183) or add `.catch()` handler:

Option 1 (preferred — use after() for serverless correctness):
```typescript
import { after } from "next/server";

after(() =>
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/ai/classify`, {
    method: "POST",
    headers: classifyHeaders,
    body: JSON.stringify({ report_id: report.id }),
  }).catch((err) => {
    console.error("[open311] classify trigger failed:", err);
    // Optionally log to error_log for operator visibility
  })
);
```

Option 2 (add explicit error handler):
```typescript
fetch(...).catch((err) => {
  console.error("[open311] classify trigger failed:", err);
});
```

---

### P1: Unhandled promise rejections in staff after() callbacks (src/app/staff/actions.ts)

Four sites pass unhandled promises to `after()`:

**Line 84 (dispatchWorkOrder):**
```typescript
after(() => notifyReportStatus(wo.report_id, "dispatched"));
```

**Line 115 (dispatchWorkOrderForReport):**
```typescript
after(() => notifyReportStatus(reportId, "dispatched"));
```

**Line 153 (closeWorkOrder):**
```typescript
after(() => notifyReportStatus(wo.report_id, "closed"));
```

**Line 179 (rejectReport):**
```typescript
after(() => notifyReportStatus(reportId, "rejected"));
```

**Why P1:** The callback `() => notifyReportStatus(...)` returns a Promise but is never awaited. If `notifyReportStatus()` throws (e.g., `createServerClient()` fails inside), the promise rejection is unhandled. Modern Node.js/Vercel terminates the invocation or logs noise.

Compare correct pattern from report/actions.ts:183:
```typescript
after(async () => {
  try {
    await runClassifyPipeline(reportId);
  } catch (err) {
    // Handle and log
  }
});
```

**Fix:** Convert all four to async with try/catch:
```typescript
after(async () => {
  try {
    await notifyReportStatus(wo.report_id, "dispatched");
  } catch (err) {
    console.error(
      `[staff] notify failed for ${wo.report_id}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
});
```

---

### P1: API routes not reporting errors to Sentry

**Files affected:**
- `src/app/api/ai/classify/route.ts:85–91`
- `src/app/api/ai/reasoning/route.ts:110–116`
- `src/app/api/open311/v2/requests/route.ts:97, 122, 268, 313`
- `src/app/api/open311/v2/requests/[id]/route.ts:74`

**Current pattern (classify route example, line 85–91):**
```typescript
} catch (err) {
  console.error("[classify] unhandled error:", err);
  return NextResponse.json(
    { error: "Internal error" },
    { status: 500 },
  );
}
```

**Why P1:** Errors logged to stdout only. Not sent to Sentry → no alerts, no dashboards, no searchable error tracking. Critical classification/reasoning failures (AI pipeline down) and public API failures (open311) will go unnoticed.

**Fix:** Add Sentry instrumentation. First, import:
```typescript
import * as Sentry from "@sentry/nextjs";
```

Then at each catch site:
```typescript
} catch (err) {
  console.error("[classify] unhandled error:", err);
  Sentry.captureException(err, {
    tags: { endpoint: "classify" },
    level: "error",
  });
  return NextResponse.json(
    { error: "Internal error" },
    { status: 500 },
  );
}
```

Alternative: Use the existing Logger pattern from `src/lib/logger.ts` if full context is needed:
```typescript
import { createLogger } from "@/lib/logger";

const log = createLogger("classify");

// At catch:
} catch (err) {
  log.error("Unhandled classify error", err);
  return NextResponse.json(...);
}
```

---

### P1: Sync classification path doesn't stamp classify_status:failed (src/app/report/actions.ts:231–240)

```typescript
// Default synchronous path — classify directly, no HTTP self-call.
let classification: Classification;
try {
  const result = await runClassifyPipeline(reportId);
  classification = result.ok
    ? { ...result.data.classification, is_emergency: result.data.emergency }
    : fallbackClassification(result.error);
} catch {
  classification = fallbackClassification(
    "Classification service unavailable",
  );
}

return { ok: true, data: { id: reportId, classification } };
```

**Why P1:** When ASYNC_CLASSIFY is OFF, the sync path (lines 231–240) runs. If it catches, it returns a fallback classification but **does not insert an error_log row or stamp classify_status:failed**. 

Contrast the async path (lines 183–219), which has a proper backstop: if pipeline throws unexpectedly, it inserts error_log and stamps classify_status:"failed" (lines 206–209). The sync path should do the same.

If the pipeline throws before any db write, no one knows the report failed classification. Report gets stuck in a silent error state.

**Fix:** Mirror the async backstop logic:
```typescript
let classification: Classification;
try {
  const result = await runClassifyPipeline(reportId);
  classification = result.ok
    ? { ...result.data.classification, is_emergency: result.data.emergency }
    : fallbackClassification(result.error);
} catch (err) {
  // Sync path error backstop: log and stamp status
  const message = err instanceof Error ? err.message : String(err);
  try {
    const service = createServerClient();
    await service.from("error_log").insert({
      correlation_id: crypto.randomUUID(),
      context: "submit-report:sync-classify",
      message: `Unhandled classify pipeline throw: ${message}`,
      metadata: { reportId },
    });
    // Only stamp classify_status if it was already set; sync path doesn't set it
    // (it only exists in async mode), so skip this for default behavior.
  } catch (logErr) {
    console.error(`submit-report: classify sync backstop failed for ${reportId}`, logErr);
  }
  classification = fallbackClassification("Classification service unavailable");
}
```

Note: The sync path doesn't set `classify_status` at insert time (line 157 is guarded by `ASYNC_CLASSIFY`). So the error_log is the signal. Operator monitoring error_log will see the sync failure.

---

### P2: auth.error not checked in report submission (src/app/report/actions.ts:59–66)

```typescript
// Auth via cookie-aware SSR client.
const ssr = await createSSRClient();
const {
  data: { user },
} = await ssr.auth.getUser();
if (!user) {
  return { ok: false, error: "unauthenticated" };
}
```

**Why P2:** Destructuring `data: { user }` from getUser() checks `!user` but **not `error`**. If `getUser()` returns an error object, code ignores it and treats the request as unauthenticated. Auth errors (service down, session revoked) are silently treated as missing user.

**Fix:** Check both error and user. Best approach: use the existing safe wrapper `getAuthUser()` from lib/db/ssr-client.ts (which already checks error):

```typescript
const user = await getAuthUser();
if (!user) {
  return { ok: false, error: "unauthenticated" };
}
```

Or manually check error:
```typescript
const { data: { user }, error } = await ssr.auth.getUser();
if (error || !user) {
  return { ok: false, error: "unauthenticated" };
}
```

---

## Safe Patterns (Clean)

- **`src/lib/ai/gemini.ts:53–112`** — Proper try/catch wrapping Gemini call. JSON.parse in inner try/catch (line 89). Returns Result<> with error details.
- **`src/lib/ai/reasoning-ai.ts:223–229`** — `getReasoning()` catches geminiReasoning() throw and falls back to template.
- **`src/lib/ai/classify-pipeline.ts`** — Comprehensive error handling with error_log insertion. Every Supabase operation checked.
- **`src/lib/notify/deliver.ts`** — fetch() wrapped in try/catch. Never throws; returns DeliveryResult.
- **`src/lib/notify/status-notify.ts:84–154`** — Entire function wrapped. Catches and returns DeliveryResult.
- **`src/lib/dashboard-queries.ts:22–33`** — `safeQuery<T>()` wrapper catches thrown errors (e.g., JSON.parse from Supabase) and returns fallback.

### P2: Unhandled .then() chains in report/page.tsx (src/app/report/page.tsx:83, 89, 326)

**Lines 83–97:**
```typescript
supabase.auth.getSession().then(({ data }) => {
  if (!data.session) {
    supabase.auth.signInAnonymously().then(({ error }) => {
      if (error) {
        setError("Could not start a session. Check your connection and refresh.");
      }
    });
  }
});
```

**Why P2:** Two .then() chains without .catch() handlers. Supabase-js v2 returns errors in-band (`{ error, data }`), so the inner `.then()` checks error correctly. **But** if getSession() or signInAnonymously() itself rejects (network failure before response), the rejection is unhandled. No catch path → silent failure on network errors.

**Line 326:**
```typescript
.maybeSingle()
.then(({ data }) =>
  applyRow(data as ... | null),
);
```

**Why:** No error check or .catch() handler. If the classifications query fails, promise rejects silently. Realtime subscription never updates; resident sees spinning loader forever.

**Fix:**

For lines 83–97:
```typescript
supabase.auth
  .getSession()
  .then(({ data }) => {
    if (!data.session) {
      return supabase.auth.signInAnonymously();
    }
  })
  .then(({ error }) => {
    if (error) {
      setError("Could not start a session. Check your connection and refresh.");
    }
  })
  .catch((err) => {
    console.error("[report] session init failed:", err);
    setError("Could not start a session. Check your connection and refresh.");
  });
```

For line 326:
```typescript
.then(({ data, error }) => {
  if (error) {
    console.error("[report] classifications subscription query failed:", error);
    return;
  }
  applyRow(data as ... | null);
})
.catch((err) => {
  console.error("[report] realtime subscription failed:", err);
});
```

---

## Client-side patterns (React components)

### ✓ Safe: work-order-detail.tsx startTransition callbacks
Lines 132–185 use proper pattern: `startTransition(async () => { const result = await action(); if (result.ok) {...} else { setError(result.error) } })`. Error checked and state updated.

### ⚠️ Unhandled: report/page.tsx .then() chains
Three sites with no .catch():
- **Line 83:** `getSession().then()` — rejection unhandled if network fails
- **Line 89:** `signInAnonymously().then()` — checks error in-band but rejection unhandled if network fails
- **Line 326:** `classifications query.then()` — no error check or handler

---

## Backlog (Priority Order)

1. **Fix logout route (P0).** Wrap createSSRClient() + signOut() in try/catch; redirect on error.
2. **Wrap open311 fetch in after() (P0).** Use next/server's after() lifecycle for serverless-safe post-response work.
3. **Add Sentry to all API routes (P1).** Classify, reasoning, open311 endpoints must report errors to Sentry, not console only.
4. **Fix staff after() callbacks (P1).** Convert to async with try/catch. Audit codebase for other unhandled after() patterns.
5. **Add sync-path error backstop (P1).** Mirror async pattern: catch, insert error_log, mark report failed.
6. **Fix report/page.tsx .then() chains (P2).** Add .catch() handlers to lines 83, 89, 326. Line 326 needs error state handling.
7. **Check auth.error in report actions (P2).** Use getAuthUser() wrapper or manually check error.
8. **Audit for unhandled promise patterns.** Grep for `after\(\s*\(\)` across src/app/*/actions.ts to find other unguarded promises.
9. **Standardize error logging.** Use createLogger() consistently; avoid bare console.error + Sentry pairs.
10. **Document error contracts.** Add JSDoc @throws or "never throws" to all public functions.
