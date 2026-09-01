# API Routes Security Audit

**Date:** 2026-06-13  
**Scope:** `src/app/api/**/*.ts` (7 routes)  
**Framework:** Next.js 14 with Supabase + TypeScript

---

## Executive Summary

Overall security posture: **GOOD** with minor findings. The codebase demonstrates:
- Proper auth guards on protected endpoints
- Constant-time API key comparison (timing-attack resistant)
- Input validation on all POST routes
- SQL injection mitigated via Supabase parameterized queries
- Thoughtful error handling (no stack leaks)
- Rate limiting on public endpoints

**Critical Issues:** None (P0)  
**High Issues:** 1 (P1). Distributed rate limiter single-point-of-failure  
**Medium Issues:** 2 (P2), Minor improvements for robustness

---

## Route-by-Route Audit

### 1. `/api/health` (GET)
**Auth:** None (public health check)  
**Risk Level:** LOW

**Findings:**
- ✅ No auth required (appropriate for monitoring)
- ✅ No user input consumed
- ✅ Safe error messages (no stack leaks)
- ✅ Checks Supabase + Gemini API readiness

**Status:** PASS

---

### 2. `/api/open311/v2/services` (GET)
**Auth:** None (public Open311 spec endpoint)  
**Risk Level:** LOW

**Findings:**
- ✅ Public endpoint per Open311 spec
- ✅ No database queries (static service list via `getAllServices()`)
- ✅ Content-type negotiation safe (no injection in `format` param parsing)
- ✅ Cache headers set (reduces load)
- ✅ No user input beyond content-type negotiation

**Status:** PASS

---

### 3. `/api/auth/logout` (POST)
**Auth:** Requires active session  
**Risk Level:** LOW

**Findings:**
- ✅ Uses `createSSRClient()` which reads session from cookies
- ✅ `supabase.auth.signOut()` invalidates session server-side
- ✅ Redirect to "/" prevents session fixation
- ✅ No CSRF token visible but relies on SameSite + HttpOnly defaults

**Status:** PASS  
**Note:** Verify SameSite=Strict + HttpOnly are set on session cookies in Supabase config.

---

### 4. `/api/ai/classify` (POST)
**Auth:** Session OR internal secret header (`x-internal-key`)  
**Risk Level:** MEDIUM

**Findings:**

**PASS:**
- ✅ Constant-time comparison on internal key using `timingSafeEqual()`
- ✅ Buffer length check prevents early-exit timing oracle before comparison
- ✅ Rate limiting on non-internal callers (exempt internal secret)
- ✅ Input validation on `report_id` (string, non-empty)
- ✅ Object-level auth via RLS-scoped SSR read (`reports_select_own`, `reports_select_staff`)
- ✅ 404 response for auth failure (information leak mitigated)
- ✅ Generic error on unhandled exceptions (no stack leaks)

**FINDINGS:**
- **P2:** Internal secret (`INTERNAL_CLASSIFY_SECRET`) is not rate-limited. A compromised internal secret could bypass rate limiting and trigger unlimited AI calls (high model cost). Consider adding per-secret quota tracking or periodic rotation.
- ✅ RLS fallback ensures even with service-role client, the SSR check prevents unauthorized reads

**Status:** PASS with minor recommendation

---

### 5. `/api/ai/reasoning` (POST)
**Auth:** Session OR internal secret (same pattern as `/classify`)  
**Risk Level:** MEDIUM

**Findings:**

**PASS:**
- ✅ Constant-time comparison on internal key
- ✅ Rate limiting on non-internal, unauthenticated browsers
- ✅ JSON parsing wrapped in try-catch with 400 response
- ✅ Input validation on `report_id` (string, non-empty)
- ✅ Safe report lookup from in-memory corpus (no injection risk)
- ✅ Distinguishes between authenticated/internal (live Gemini) vs. anonymous (template fallback)
- ✅ No stack leaks in error handling

**FINDINGS:**
- **P2:** Anonymous users receive template reasoning without triggering live Gemini calls (good cost control). However, no explicit rate limit shown for authenticated users beyond the standard AI rate limiter. Verify the `getReasoning()` function doesn't retry on transient errors (could amplify costs on unstable Gemini API).

**Status:** PASS

---

### 6. `/api/open311/v2/requests` (GET & POST)
**Auth:** None for GET (public), POST requires API key  
**Risk Level:** MEDIUM → HIGH (combined GET+POST)

#### GET `/api/open311/v2/requests`
**Auth:** None (public Open311 list)

**Findings:**

**PASS:**
- ✅ Rate limited: 60 req/min per IP (generous for spec compliance)
- ✅ Status validation: rejects invalid values (only "open"/"closed")
- ✅ Pagination sanitization: page/page_size parsed as int, constrained (1-200)
- ✅ Date range filters: passed as-is but Supabase parameterizes them
- ✅ Service code filter validated against `getService()` in POST (implicit)
- ✅ SELECT statement limits to `PUBLIC_REPORT_SELECT` (no description, no raw photo URL, no reporter_id)
- ✅ Rejected/merged reports filtered from public feed
- ✅ Error responses sanitized

**Status:** PASS

#### POST `/api/open311/v2/requests`
**Auth:** API key (hardcoded `OPEN311_API_KEY` env var)

**Findings:**

**PASS:**
- ✅ Constant-time API key comparison using SHA256 hashing (prevents timing oracle)
- ✅ Content-type handling: supports JSON + form-encoded (safe parsing)
- ✅ Service code validation: checked against `getService()`
- ✅ Lat/long parsing: validated as floats, range checks (-90 to 90, -180 to 180)
- ✅ Description length limit: 2000 chars
- ✅ Address length limit: 300 chars
- ✅ Media URL validation: https-only, URL-parsed (prevents tracking pixels/XSS)
- ✅ Jurisdiction lookup: parameterized query, validates city exists
- ✅ Reporter ID: uses system user (not user-supplied)
- ✅ Location stored as PostGIS POINT (injection-resistant)
- ✅ Async classification with internal key (fire-and-forget)
- ✅ XML escaping in POST response (`escXml()`)

**FINDINGS:**
- **P1 (HIGH):** Missing CSRF token validation. While POST endpoints are typically less vulnerable, the form-encoded path could be CSRF'd from another site (e.g., attacker's webpage with hidden form POST to your API). **Mitigation:** Add explicit CSRF check or enforce `Content-Type: application/json` only (reject form-encoded).
- ✅ API key is environment-based, not user-provided, reducing per-user secret exposure

**Status:** PASS with CSRF mitigation required

---

### 7. `/api/open311/v2/requests/[id]` (GET)
**Auth:** None (public Open311 single-request lookup)  
**Risk Level:** LOW

**Findings:**
- ✅ Rate limited: 60 req/min per IP
- ✅ UUID format validation: regex check (`[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`) prevents invalid IDs from reaching DB
- ✅ SELECT same safe columns as GET list
- ✅ Parameterized query `.eq("id", id)`
- ✅ 404 on not found (no information leak)

**Status:** PASS

---

## Cross-Cutting Findings

### Database & SQL Injection
- **✅ PASS:** All queries use Supabase SDK parameterized queries (`.eq()`, `.select()`, `.in()`)
- **✅ PASS:** PostGIS geometry (`SRID=4326;POINT(...)`) constructed with interpolation, but only numeric values (lat/long) are inserted
- **✅ PASS:** No raw SQL or string concatenation observed

### Authentication & Authorization
- **✅ PASS:** `getAuthUser()` reads session from cookies via `createSSRClient()`
- **✅ PASS:** Service-role client isolated to internal routes (not exposed to browsers)
- **✅ PASS:** RLS enforcement on sensitive reads (classify, reasoning endpoints)
- **✅ PASS:** Internal secret (`x-internal-key`) constant-time compared

### Rate Limiting
- **✅ PASS:** Implemented on public/expensive endpoints (classify, reasoning, Open311 list/get)
- **⚠ P1:** In-memory fixed-window limiter. Per comments, effective limit under multi-instance = (instances * max). **Under load or multi-region deployment, this fails silently.** Recommend:
  - Document the limitation clearly
  - Plan Upstash/Redis migration for production scale
  - Add telemetry to detect distributed limit bypass

### Error Handling
- **✅ PASS:** No stack traces leaked (catch blocks return generic messages)
- **✅ PASS:** SQL errors logged but not echoed to clients
- **✅ PASS:** 404 responses don't disclose existence (information leak prevented)

### Input Validation
- **✅ PASS:** All string inputs have length checks
- **✅ PASS:** Numeric inputs parsed + range validated
- **✅ PASS:** Enum-like fields (status, format) validated against whitelist
- **✅ PASS:** JSON parsing wrapped in try-catch

### Content-Type & Encoding
- **✅ PASS:** XML responses set `Content-Type: text/xml; charset=utf-8`
- **✅ PASS:** JSON responses use `NextResponse.json()` (auto-encoded)
- **✅ PASS:** XML escaping implemented (`escXml()`)
- **⚠ P2:** Open311 POST accepts both JSON and form-encoded without explicit validation. Consider rejecting form-encoded to eliminate CSRF surface.

---

## Severity Summary

| Severity | Count | Issues |
|----------|-------|--------|
| P0 (Critical) | 0 | - |
| P1 (High) | 1 | CSRF token missing on Open311 POST |
| P2 (Medium) | 2 | Distributed rate-limit fallback; internal-secret quota tracking |
| P3 (Low) | 0 | - |

---

## Recommendations

### Immediate (P1)
1. **Add CSRF protection to `/api/open311/v2/requests` POST:**
   - Enforce `Content-Type: application/json` only (reject form-encoded)
   - OR implement CSRF token validation (via cookie + body/header comparison)

### Short-term (P2)
2. **Rate Limiter Distribution:**
   - Document current limitation (per-instance limiter, not distributed)
   - Add telemetry to detect multi-instance bypass
   - Plan Upstash/Redis integration for production

3. **Internal Secret Quota:**
   - Track API calls per secret (add per-key rate limit tier)
   - Implement secret rotation policy (30-day expiry)
   - Log all internal-key access for audit

### Best Practice (P3)
4. **Logging & Monitoring:**
   - Add structured logging (request ID, auth method, rate-limit status) for observability
   - Monitor classify/reasoning endpoint costs (detect abuse early)

5. **Timeout Protection:**
   - Verify all external API calls (Gemini) have explicit timeouts
   - Document SLA for each endpoint

---

## Audit Artifacts

- **Audited Routes:** 7 files
- **Lines of Code Reviewed:** ~950 lines
- **Test Coverage:** N/A (no test files in scope)
- **Third-Party Dependencies:** Supabase SDK, Next.js, Node crypto module (all standard)

---

## Sign-Off

This audit confirms the API routes follow OWASP API Top 10 best practices for auth, input validation, SQL injection mitigation, and error handling. The single P1 finding (CSRF) is readily addressable. The rate limiter limitation is documented and suitable for current scale but requires upgrade planning.

**Recommendation:** Approve for production with CSRF mitigation in place.
