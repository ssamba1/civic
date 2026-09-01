# Security smell scan

**Summary:** 7 findings across auth, input validation, and secrets hardcoding. No critical RCE/SSRF/RLS bypasses detected. Hardcoded dev credentials and open-redirect risk are top issues.

---

## Detailed findings

| File:Line | Severity | Issue | Fix |
|-----------|----------|-------|-----|
| src/app/login/login-form.tsx:15-16 | **HIGH** | Dev credentials hardcoded in source code (admin@civicdemo.com / civic-admin-2026) visible even in production builds if NODE_ENV check fails. | Remove hardcoded credentials. Use environment variables or database-seeded test accounts only. Guard with `process.env.NEXT_PUBLIC_DEMO_MODE` instead of `NODE_ENV` for safer gating. |
| src/app/auth/callback/route.ts:29 | **MEDIUM** | Open redirect vulnerability: `next` parameter only checks `startsWith("/")` but does not validate against a whitelist. Attacker can craft `//evil.com` or `///evil.com` to bypass check. | Validate `next` against a whitelist of allowed internal paths (e.g., `/user/`, `/report/`, `/staff/`) or use a fixed set of destinations. |
| src/app/api/open311/v2/requests/route.ts:278 | **MEDIUM** | Unsafe fetch to user-controlled URL: `process.env.NEXT_PUBLIC_SITE_URL` is public config and could be spoofed by attacker via .env substitution on shared infra. Fetch is fire-and-forget so error handling is absent. | Use a hardcoded internal URL or validate `NEXT_PUBLIC_SITE_URL` matches the current request origin before building the fetch URL. Add error handling and circuit-breaker for background classification job. |
| src/app/api/ai/classify/route.ts:45-46 | **LOW** | Unvalidated `report_id` from request body only checks type/length, not UUID format. Malformed ID passed to DB query could leak error details. | Validate `report_id` against UUID regex pattern (`/^[a-f0-9-]{36}$/i`) before querying. |
| src/app/api/open311/v2/requests/route.ts:156-157 | **LOW** | API key sourced from both request body and URL query param without order precedence documented. Attacker could log the query param in browser history or HTTP access logs. | Prefer only request body for API key. If query param fallback needed, document explicitly and log a warning if used in production. |
| src/lib/privacy/signed-url.ts:34-70 | **CLEAN** | Signed URL generation for raw photos validates requester role (staff_dispatcher/supervisor/admin) and city membership before issuing 10-minute token. Authorization check is correct and comprehensive. | No action needed. Implementation is secure. |
| src/components/map/report-map.tsx:480-482 + src/components/map/map-popup.tsx:105-163 | **CLEAN** | `dangerouslySetInnerHTML` used in map popup, but `renderPopupHTML()` escapes all user-controlled fields (report.address, report.severity, report.created_at, cost estimate, status label) via `esc()` helper. Static CATEGORY_META template is safe. Comment explicitly documents the escaping gate (line 478). | No action needed. Escaping is comprehensive and inline documentation is clear. |
| src/app/api/open311/v2/requests/route.ts:240-248 | **CLEAN** | media_url parameter validated for https:// protocol and valid URL syntax before insertion. Prevents XSS/tracking-pixel injection and SSRF (since only external https URLs are allowed). | No action needed. Validation is appropriate for external media URLs. |

---

## Detailed analysis by category

### Secrets & Credentials (HIGH)
- **src/app/login/login-form.tsx:15-16**: Dev email + password hardcoded. `NODE_ENV` check is insufficient on shared CI/build systems where NODE_ENV can be environment-spoofed. Risk: leaked credentials in source control, git history, or GitHub audit logs.
  - **Mitigation:** Migrate to `NEXT_PUBLIC_DEMO_MODE` feature flag or database seeding of test accounts. Regenerate admin credentials if this repo is public.

### Open Redirects (MEDIUM)
- **src/app/auth/callback/route.ts:29**: `next.startsWith("/")` allows `//evil.com` (protocol-relative redirect). Does not block `../../../` traversal patterns (though Next.js routing limits impact). An attacker can chain with social engineering to steal OAuth tokens.
  - **Mitigation:** Use a whitelist of safe destinations or parse `next` as a URL object and reject anything outside the same origin: `new URL(next, url.origin).origin === url.origin`.

### Unsafe Fetch / SSRF Risk (MEDIUM)
- **src/app/api/open311/v2/requests/route.ts:278**: Fire-and-forget fetch to `${process.env.NEXT_PUBLIC_SITE_URL}/api/ai/classify`. If `NEXT_PUBLIC_SITE_URL` is attacker-controlled (e.g., injected via GitHub Actions secrets or .env.local on shared CI), classify route is called on attacker's domain. No error handling, so failures are silent.
  - **Mitigation:** (1) Hardcode the internal URL and validate `NEXT_PUBLIC_SITE_URL` matches `new URL(request.url).origin`, (2) Add error logging + timeout, (3) Consider queueing (Bull/Temporal) instead of direct HTTP.

### Input Validation (LOW)
- **src/app/api/ai/classify/route.ts:45-46**: `report_id` checked for `typeof reportId !== "string"` and truthy, but not validated against UUID format. A malformed ID like `report_id="'; DROP TABLE reports;--"` would be safely handled by Supabase parameterized queries, but error responses could leak DB schema.
  - **Mitigation:** Add `const uuidRegex = /^[a-f0-9-]{36}$/i; if (!uuidRegex.test(reportId)) return NextResponse.json({error:"Invalid report_id"}, {status:400});` before DB query.

- **src/app/api/open311/v2/requests/route.ts:156-157**: API key extracted from both `body.api_key` and `request.nextUrl.searchParams.get("api_key")`. Query param keys are logged in HTTP access logs and browser history. No clear precedence rule.
  - **Mitigation:** Accept only from body; reject if provided in query param and return 400 with message "api_key must be in request body, not query string". Add audit log entry if query param is detected.

---

## Auth & Authorization (Clean)

**src/lib/privacy/signed-url.ts**. Comprehensive role + city check before issuing signed URLs for raw photos. Uses SSR client (cookie-aware) for authorization gate, service-role client only for token generation. No bypass found.

**src/app/api/ai/classify/route.ts:54-75**. Reports are re-gated after the internal-key check: unauthenticated callers must own or staff the report (RLS scoped read via SSR client). The pipeline runs under service-role (correct for RLS bypass context) but read authorization is enforced upstream. No object-level bypass.

**src/app/staff/actions.ts:14-46**. Staff actions use `getStaffUser()` which validates role (staff_dispatcher, staff_supervisor, admin) before any mutation. Dev bypass (`DEV_AUTH_BYPASS=1 + NODE_ENV=development`) is correctly gated and only picks the first dev staff user, not an arbitrary one.

---

## XSS & Output Encoding (Clean)

**src/components/map/map-popup.tsx**, Inline `esc()` function escapes HTML entities (&, <, >, ", '). Used on all user-controlled fields: address, status label, severity, reported date, cost, SLA. CATEGORY_META is a static constant.

**src/lib/open311/xml.ts**. XML serialization uses parameterized `tag()` helper that escapes all values via `esc()` function. No XML injection risk.

**src/app/api/open311/v2/requests/route.ts:299**, XML response manually escapes report.id using `escXml()` inline helper.

---

## Rate Limiting & DOS (Clean)

**src/app/api/ai/classify/route.ts:25-37**, Rate limiter checked per IP for non-internal callers. Internal key (server actions, Open311) bypasses limit (acceptable: trusted context).

**src/app/api/ai/reasoning/route.ts:47-56**, Rate limiter on reasoning endpoint: 60 req/min per IP for anonymous, exempt for authenticated users and internal-key callers.

**src/app/api/open311/v2/requests/route.ts:27-32**. GET /requests rate-limited to 60 req/min per IP (generous for public spec clients).

---

## Database & RLS (Clean)

All parameterized queries via Supabase client. No string interpolation in WHERE clauses.

PUBLIC_REPORT_SELECT explicitly lists safe columns only: no photo_raw_url, no reporter PII, no description in public feed (H13 compliance).

Image MIME type validated on upload: magic-byte sniff after blob.type allowlist (src/lib/privacy/upload.ts:35-50).

---

## Severity Summary

- **HIGH (1):** Hardcoded dev credentials (src/app/login/login-form.tsx:15-16)
- **MEDIUM (2):** Open redirect (auth/callback/route.ts:29), unsafe fetch URL (open311 POST classify call)
- **LOW (2):** Unvalidated report_id format, API key from query param
- **CLEAN (3):** Signed URLs, popup XSS, open311 XML/media validation

**Top Action:** Remove hardcoded credentials immediately; whitelist redirect destinations; validate fetch URL origin.
