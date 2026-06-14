# Comprehensive Code Audit Summary

**Audit Period:** Single session, read-only review  
**Scope:** Full codebase (207 TS/TSX files), API routes, server actions, AI pipeline, database schema, RLS policies, client code  
**Coverage:** Error handling, concurrency, input validation, TOCTOU races, database security

---

## Findings by Severity

### P0 (Critical: Broken/Unsafe) — 2 findings

1. **Logout route unprotected** [05-error-handling.md]
   - File: `src/app/api/auth/logout/route.ts:4–8`
   - Issue: `createSSRClient()` and `signOut()` have no error handling
   - Risk: Logout page shows error instead of completing logout
   - Fix: Wrap in try/catch, redirect on error

2. **Unawaited fetch without error handler** [05-error-handling.md]
   - File: `src/app/api/open311/v2/requests/route.ts:278–282`
   - Issue: Classification trigger doesn't await or .catch() the fetch
   - Risk: Classification never runs on network failure; caller sees 201 success
   - Fix: Wrap in `after()` or add `.catch()` handler

---

### P1 (High: Should Fix) — 7 findings

1. **Staff after() callbacks unhandled promises** [05-error-handling.md]
   - Files: `src/app/staff/actions.ts:84, 115, 153, 179` (4 sites)
   - Issue: `after(() => notifyReportStatus(...))` returns unhandled Promise
   - Risk: Unhandled promise rejections crash invocation
   - Fix: Convert to `after(async () => { try { await ... } catch {...} })`

2. **API routes not reporting errors to Sentry** [05-error-handling.md]
   - Files: classify, reasoning, open311 routes (7 endpoints)
   - Issue: Errors logged to console only, not sent to Sentry
   - Risk: Critical failures invisible to ops; no alerts or dashboards
   - Fix: Add `Sentry.captureException(err)` at each catch site

3. **Sync classification path doesn't mark failures** [05-error-handling.md]
   - File: `src/app/report/actions.ts:231–240`
   - Issue: Sync path catches but doesn't insert error_log or stamp classify_status:failed
   - Risk: Failed classifications are silent; no operator signal
   - Fix: Mirror async backstop logic; insert error_log and stamp status

4. **Whitespace-only input passes validation** [20-input-validation.md]
   - File: `src/app/report/actions.ts:14–25`
   - Issue: Schema accepts `description: "   "` and empty string tags
   - Risk: Noise data in database; pollutes reports and filters
   - Fix: Add `.trim()` and `.min(1)` to address, description, tags

5. **Client .then() chains unhandled** [05-error-handling.md]
   - File: `src/app/report/page.tsx:83, 89, 326` (3 sites)
   - Issue: Three `.then()` chains without `.catch()`
   - Risk: Network errors cause silent failures; spinner never resolves
   - Fix: Add `.catch(err => { setError(...) })` handlers

6. **Service-role usage undocumented** [22-database-and-security.md]
   - File: `src/lib/db/client.ts:7`
   - Issue: Service-role client has no JSDoc explaining internal-only constraint
   - Risk: Future developers might accidentally expose it client-side
   - Fix: Add `@internal` JSDoc; maintain strict pattern in code review

---

### P2 (Nice-to-have) — 12 findings

**Concurrency & State** [19-concurrency-and-state.md]
1. Non-atomic cache in reasoning-ai.ts (concurrent Gemini calls wasted)
2. Realtime subscription fires one-shot query multiple times on remount

**Input Validation** [20-input-validation.md]
3. WGS84 pole coordinates allowed (edge case, low risk)
4. (whitespace already listed as P1 above)

**TOCTOU & Race Conditions** [21-toctou-race-conditions.md]
5. Stale auth check in classify route (low probability race)
6. Non-atomic dispatch updates (concurrent timestamp collision)

**Error Handling** [05-error-handling.md]
7. Async backstop doesn't retry status stamp if error_log insert fails
8. Auth error not checked in report submission

**Database & Security** [22-database-and-security.md]
9. Hardcoded dev credentials in source (gated to dev only)
10. Missing explicit INSERT deny policies (clarifies intent)

---

## Summary by Domain

| Domain | Files | Findings | Status |
|--------|-------|----------|--------|
| **Error Handling** | API routes, server actions, client code | 14 (2P0, 6P1, 6P2) | 4 new audit reports |
| **Concurrency** | AI pipeline, realtime subscriptions | 2 (P2) | Partial cache issue, inefficient resubs |
| **Input Validation** | Report submission, API POST | 3 (1P1, 2P2) | Schema gaps, edge cases |
| **TOCTOU Races** | Classify route, dispatch actions | 2 (P2) | Low-probability, mostly safe |
| **Database & Security** | Schema, RLS, app initialization | 3 (1P1, 2P2) | Well-designed, minor hygiene |
| **Totals** | — | **24 findings** | **2P0, 7P1, 12P2** |

---

## Key Strengths

1. **Error handling patterns mostly good:** Result<T> return types, error_log audit table, logger with Sentry integration
2. **Database design solid:** Comprehensive RLS, good indexes, cascades intentional, audit triggers
3. **No SQL injection:** All queries use parameterized operators
4. **Service-role isolated:** Only in server-side code (lib/db, actions, routes)
5. **Type safety:** Strict TypeScript, Zod validation on inputs
6. **Image processing:** Proper error handling in blob conversions and MIME detection

---

## Recommended Fix Priority

### Immediate (Session 1)
1. **Logout route** — P0, 5 min
2. **Open311 fetch** — P0, 5 min
3. **Staff after() callbacks** — P1, 10 min
4. **Add Sentry to API routes** — P1, 15 min
5. **Sync classify path** — P1, 10 min

### This Week
6. **Client .then() chains** — P1, 10 min
7. **Whitespace validation** — P1, 10 min
8. **Service-role JSDoc** — P1, 5 min
9. **Dev credentials to env** — P2, 5 min

### Next Sprint (P2 backlog)
10. Promise memoization in reasoning cache
11. Realtime subscription one-shot guard
12. Coordinate edge case docs
13. RLS INSERT deny policies
14. Audit service-role call tracing (future)

---

## Files to Review in Next Iteration

- **Error Handling:** All 7 API route files, all server actions, client report/page.tsx
- **Database:** Schema migrations, RLS policy coverage
- **Performance:** Check for N+1 queries in dashboard queries and resident data
- **Security:** Audit sensitive data in responses, check for PII leaks

---

## Audit Reports Generated

- `05-error-handling.md` — 14 findings (errors, promises, Sentry)
- `19-concurrency-and-state.md` — 2 findings (cache, subscriptions)
- `20-input-validation.md` — 3 findings (schemas, coordinates)
- `21-toctou-race-conditions.md` — 2 findings (auth, dispatch)
- `22-database-and-security.md` — 3 findings (creds, RLS, schema)
- `00-AUDIT-SUMMARY.md` — This document

