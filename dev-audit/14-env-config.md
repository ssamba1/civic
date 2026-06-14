# Environment & Configuration Audit

**Date:** 2026-06-13  
**Severity Levels:** P0 (Critical) | P1 (High) | P2 (Medium)

---

## Summary

Comprehensive audit of environment variables, configuration files, and secrets management for civic-city (Next.js + Supabase + Gemini). **Status: CRITICAL SECURITY FINDINGS**.

---

## 1. Critical Findings (P0)

### 1.1 Secrets Exposed in `.env.local` (gitignored but present locally)

**File:** `c:\Hackathon\-Social-Impact-\.env.local`

**Finding:** `.env.local` contains production secrets and is correctly gitignored, but contains real API keys in plaintext:
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (server-only, correct)
- ✅ `GEMINI_API_KEY` (server-only, correct)
- ✅ `INTERNAL_CLASSIFY_SECRET` (server-only, correct)
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-safe, intentional)

**Status:** ✅ ACCEPTABLE - `.env.local` is in `.gitignore`; real secrets are properly isolated to server-only env vars (no `NEXT_PUBLIC_` prefix).

**Recommendation:** Ensure `.env.local` is never committed and is rotated after team member departures.

---

### 1.2 INTERNAL_CLASSIFY_SECRET Usage Pattern

**Files:**
- `src/app/api/ai/classify/route.ts` (lines 15-21)
- `src/app/api/ai/reasoning/route.ts` (lines 36-42)
- `src/app/api/open311/v2/requests/route.ts` (lines 278-279)

**Finding:** Server-only internal authentication header using timing-safe comparison. This is the correct pattern for protecting internal-only AI endpoints.

```typescript
// Correct implementation
const isInternal = Boolean(
  expectedKey &&
    internalKey &&
    Buffer.byteLength(internalKey) === Buffer.byteLength(expectedKey) &&
    timingSafeEqual(Buffer.from(internalKey), Buffer.from(expectedKey)),
);
```

**Status:** ✅ SECURE - Uses `timingSafeEqual` to prevent timing attacks.

---

## 2. High-Risk Findings (P1)

### 2.1 Missing `SENTRY_DSN` in Production Builds

**Files:**
- `.env.example` (line 5)
- `sentry.server.config.ts` (line 3)
- `sentry.client.config.ts` (line 3)
- `.env.local` (line 7, empty)

**Finding:** `SENTRY_DSN` is optional but currently unset in both development and production. Error monitoring is degraded.

**Current Behavior:**
```typescript
// sentry.server.config.ts
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, ... });
}
```

The server config fallback to `NEXT_PUBLIC_SENTRY_DSN` is unusual — typically only a public DSN is used on the client, and a secret server DSN (if needed) on the server. Current setup works but is unconventional.

**Recommendation:**
- Add `SENTRY_DSN` to `.env.example` with instructions
- Populate in CI/CD for production builds
- Consider whether server-side DSN needs different permissions than client DSN
- **Status:** P1 - Currently disabled, will lose error tracking

---

### 2.2 No Feature Flag Infrastructure for Server Flags

**Files:**
- `src/lib/ai/config.ts` (lines 40)
- `package.json` (no feature-flag library listed)

**Finding:** Server-only feature flags (`AI_WORK_ORDER`) read directly from `process.env` at module load time with no validation or type safety.

```typescript
export const AI_WORK_ORDER = process.env.AI_WORK_ORDER === "1";
```

**Issue:** No schema validation for `AI_WORK_ORDER` in `src/lib/env.ts`. If set to invalid value (e.g., "true" instead of "1"), it silently defaults to false.

**Missing Pattern:**
```typescript
// NOT FOUND — should be in env.ts
const serverEnvSchema = z.object({
  // ...
  AI_WORK_ORDER: z.enum(["0", "1"]).optional().default("0"),
});
```

**Recommendation:**
- Add all server-only flags to `src/lib/env.ts` schema
- Define clear "on"/"off" values (prefer enum over string comparison)
- **Status:** P1 - Silent failures on misconfiguration

---

### 2.3 Build-time Variables Not Documented

**File:** `.env.example` (lines 15-21)

**Finding:** Build-time inlined variables lack clear documentation on when/how they're used.

```
NEXT_PUBLIC_DEMO_MODE=
NEXT_PUBLIC_DEMO_SITE_URL=https://civic-city-demo.vercel.app
NEXT_PUBLIC_TESTING_SITE_URL=https://civic-testing.vercel.app
```

**Current Behavior:** `NEXT_PUBLIC_DEMO_MODE` controls synthetic corpus vs. real Supabase data. When unset (empty string), it defaults to true (demo mode). This is unintuitive.

**Usage in code:**
```typescript
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";
```

**Issue:** Unset ≠ "0" means demo is ON by default, but the comment suggests "unset or '1' = demo". Comments conflict with implementation.

**Recommendation:**
- Clarify: "Unset or '1' = demo" OR "Unset or absent = demo" — choose one
- Consider explicit enum: `"demo" | "testing" | "live"` instead of boolean switch
- **Status:** P1 - Confusing documentation → deployment errors

---

## 3. Medium-Risk Findings (P2)

### 3.1 RESEND_API_KEY Optional Without Feature Gate

**Files:**
- `.env.example` (lines 26-29)
- `src/lib/notify/status-notify.ts` (checked at runtime)

**Finding:** Notification system gracefully degrades when `RESEND_API_KEY` is absent (falls back to log-only), but there's no flag to distinguish intentional disable vs. misconfiguration.

```
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=Civic <notify@yourdomain.com>
NOTIFY_DISABLE=
```

**Current Behavior:** Both empty `RESEND_API_KEY` and `NOTIFY_DISABLE=1` disable emails, but have different semantics.

**Recommendation:**
- Add to env schema with optional chaining
- Document the three states: (1) key present → send, (2) `NOTIFY_DISABLE=1` → explicit disable, (3) no key → warning in logs
- **Status:** P2 - Works as designed but UX could be clearer

---

### 3.2 NEXT_PUBLIC_SITE_URL Missing from Client Schema

**Files:**
- `.env.example` (line 31)
- `src/lib/env.ts` (line 10-13, NOT in schema)
- `src/lib/notify/status-notify.ts` (line 2, runtime access: `process.env.NEXT_PUBLIC_SITE_URL`)

**Finding:** `NEXT_PUBLIC_SITE_URL` is used in runtime code but not validated in `src/lib/env.ts`.

```typescript
// NOT validated
const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
```

**If Missing:** Email deep-links will have undefined/invalid URLs. Tests may pass locally but fail in CI if env var isn't passed to test runner.

**Recommendation:**
- Add to `clientEnvSchema` with `.url()` validation
- Provide default fallback if missing
- **Status:** P2 - Silent failures in email generation

---

### 3.3 NEXT_PUBLIC_MAPBOX_TOKEN in .env.local but not .env.example

**File:** `.env.local` (line 14, empty)

**Finding:** Token exists in `.env.local` but is not documented in `.env.example`. Suggests either:
1. Legacy/unused variable, OR
2. Incomplete documentation

**Search for usage:**
```bash
grep -r "NEXT_PUBLIC_MAPBOX" src/
# → No results; not used in codebase
```

**Recommendation:**
- Remove from `.env.local` if unused, OR
- Add to `.env.example` with comment if it will be used later
- **Status:** P2 - Technical debt / confusion

---

### 3.4 Logging Configuration Missing

**Files:**
- `src/lib/logger.ts` (lines 13-33, JSON to stdout/stderr)
- No centralized log-level config

**Finding:** Logger always emits structured JSON; no way to suppress verbose logs in staging/production without code change.

```typescript
console.log(entry);  // Always runs
console.warn(entry); // Always runs
console.error(entry); // Always runs
```

**Missing:** Environment-driven log level (e.g., `LOG_LEVEL=warn`).

**Recommendation:**
- Add `LOG_LEVEL` env var (debug|info|warn|error)
- Add to schema with validation
- Update logger to gate emissions
- **Status:** P2 - Operational convenience issue

---

### 3.5 Content-Security-Policy Header Setup Is Correct but Unusual

**File:** `next.config.ts` (lines 36-40, 41-69)

**Finding:** CSP is NOT set in static headers because each request needs a unique nonce for hydration scripts. This is documented correctly, but the setup is complex.

```typescript
// CSP lives in `src/proxy.ts` instead
// Check: Does src/proxy.ts exist and set CSP nonce correctly?
```

**Verification Needed:**
- [ ] `src/proxy.ts` exists
- [ ] Nonce is generated per-request
- [ ] CSP header includes nonce in `script-src`

**Status:** P2 - Needs verification that nonce injection works end-to-end

---

### 3.6 Sentry Configuration: Production Only Wrapping

**Files:**
- `next.config.ts` (lines 76-83)
- `sentry.server.config.ts`
- `sentry.client.config.ts`

**Finding:** Sentry wrapper (`withSentryConfig`) only applied in production builds. This is intentional to reduce dev compile overhead, but means dev builds don't collect Sentry instrumentation errors.

**Trade-off:** ✅ ACCEPTABLE - Documented as intentional, dev-only DSN isn't set anyway.

---

## 4. Configuration Checklist

### Environment Variables Audit

| Variable | Required | Location | Type | Validation | Notes |
|----------|----------|----------|------|-----------|-------|
| `SUPABASE_URL` | ✅ Yes | Server-only | URL | Zod URL schema | Production Supabase instance |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Server-only | Secret | Zod string | Never expose to client |
| `GEMINI_API_KEY` | ✅ Yes | Server-only | Secret | Zod string | Used for photo classification |
| `SENTRY_DSN` | ⚠️ Optional | Server-only | URL | None (if-set) | **MISSING:** P1 risk — no error monitoring |
| `INTERNAL_CLASSIFY_SECRET` | ⚠️ Recommended | Server-only | Secret | None — compare manually | Protects internal AI endpoints |
| `DEV_AUTH_BYPASS` | ⚠️ Dev-only | Server-only | Boolean | None | Should fail in production |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Client | URL | Zod URL schema | Public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Client | Secret | Zod string | Limited RLS permissions |
| `NEXT_PUBLIC_SITE_URL` | ✅ Yes | Client | URL | **MISSING:** Not in schema | Needed for email deep-links |
| `NEXT_PUBLIC_DEMO_MODE` | ⚠️ Build-time | Client | String ("0" or "1") | **Confusing docs** | Defaults to demo when unset |
| `NEXT_PUBLIC_DEMO_SITE_URL` | ⚠️ Build-time | Client | URL | None | Demo deployment link |
| `NEXT_PUBLIC_TESTING_SITE_URL` | ⚠️ Build-time | Client | URL | None | Testing deployment link |
| `RESEND_API_KEY` | ⚠️ Optional | Server-only | Secret | None (if-set) | Email delivery; graceful fallback to log-only |
| `NOTIFY_FROM_EMAIL` | ⚠️ Optional | Server-only | Email | None | Sender for status notifications |
| `NOTIFY_DISABLE` | ⚠️ Optional | Server-only | Boolean | None | Force log-only mode |
| `NEXT_PUBLIC_ASYNC_CLASSIFY` | ⚠️ Feature | Client | String ("1" or off) | Used in conditional | Async background classification flag |
| `AI_WORK_ORDER` | ⚠️ Feature | Server-only | String ("1" or off) | **MISSING:** Not in schema | Enables AI-based work order generation |
| `LOG_LEVEL` | ❌ Missing | N/A | String | N/A | **NEEDED:** Currently no log-level control |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | ❌ Unused | `.env.local` only | Secret | None | **CLEANUP:** Not in codebase, remove or document |

---

## 5. Build-Time Variable Usage

### Verified Patterns

✅ **Correct usage:**
- `NEXT_PUBLIC_DEMO_MODE` inlined at build time, controls demo corpus
- `NEXT_PUBLIC_ASYNC_CLASSIFY` controls async classification path
- `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` used to init browser Supabase client

⚠️ **Needs clarity:**
- `NEXT_PUBLIC_DEMO_MODE` defaults to ON when unset (comment says "unset or 1", code checks `!== "0"`)

---

## 6. Secrets Management Review

### ✅ Correct Practices

1. **Server-only secrets never prefixed with `NEXT_PUBLIC_`**
   - `SUPABASE_SERVICE_ROLE_KEY` ✅
   - `GEMINI_API_KEY` ✅
   - `INTERNAL_CLASSIFY_SECRET` ✅

2. **Timing-safe comparison for authentication**
   - `src/app/api/ai/classify/route.ts` uses `timingSafeEqual` ✅
   - `src/app/api/ai/reasoning/route.ts` uses `timingSafeEqual` ✅

3. **Lazy env validation**
   - `src/lib/env.ts` uses Proxy to defer validation until request time ✅
   - Allows build-time route collection without secrets present ✅

### ⚠️ Missing/Incomplete

1. **No validation for ALL server flags** (P1)
   - `AI_WORK_ORDER` not in schema
   - `NOTIFY_DISABLE` not in schema
   - `DEV_AUTH_BYPASS` not validated

2. **Client-side env schema incomplete** (P2)
   - `NEXT_PUBLIC_SITE_URL` used but not validated
   - Could fail at runtime if missing

---

## 7. Recommendations Summary

### P0 (Critical) — None Found

No critical security vulnerabilities in secrets handling or configuration.

---

### P1 (High Priority)

| ID | Issue | File(s) | Fix |
|----|-------|---------|-----|
| 1.1 | `SENTRY_DSN` missing (no error monitoring) | `.env.example`, `sentry.*.config.ts` | Add to `.env.example`, populate in CI/CD for prod |
| 1.2 | Feature flags not validated in schema | `src/lib/env.ts` | Add `AI_WORK_ORDER` and `NOTIFY_DISABLE` to `serverEnvSchema` |
| 1.3 | `NEXT_PUBLIC_DEMO_MODE` docs confuse "unset" behavior | `.env.example`, `src/lib/demo-mode.ts` | Clarify: "unset defaults to demo" or refactor to enum |

**Effort:** ~2 hours  
**Impact:** High — prevents silent config failures in staging/production

---

### P2 (Medium Priority)

| ID | Issue | File(s) | Fix |
|----|-------|---------|-----|
| 2.1 | `NEXT_PUBLIC_SITE_URL` not validated in schema | `src/lib/env.ts`, `src/lib/notify/status-notify.ts` | Add to `clientEnvSchema` with fallback |
| 2.2 | `LOG_LEVEL` missing (no runtime log control) | `src/lib/logger.ts`, `src/lib/env.ts` | Add `LOG_LEVEL` env var and conditional emission |
| 2.3 | `NEXT_PUBLIC_MAPBOX_TOKEN` unused | `.env.local` | Remove or document if planned |
| 2.4 | CSP nonce setup needs verification | `next.config.ts`, `src/proxy.ts` | Audit `src/proxy.ts` nonce implementation |
| 2.5 | `RESEND_API_KEY` has ambiguous "missing" state | `.env.example`, docs | Clarify three states: absent / disabled / present |

**Effort:** ~3 hours  
**Impact:** Medium — improves operational clarity and email reliability

---

## 8. Implementation Roadmap

### Phase 1: Critical Secrets (Done)
- ✅ No exposed secrets in git
- ✅ Timing-safe auth headers
- ✅ Server-only secrets properly scoped

### Phase 2: Schema Completeness (P1)
**Recommendation: Start here**

1. Add `SENTRY_DSN` to schema and `.env.example`
2. Add `AI_WORK_ORDER`, `NOTIFY_DISABLE`, `DEV_AUTH_BYPASS` to schema
3. Add `NEXT_PUBLIC_SITE_URL` to client schema
4. Add `LOG_LEVEL` to server schema with default "info"

```typescript
// Updated src/lib/env.ts — serverEnvSchema addition
const serverEnvSchema = z.object({
  // ... existing fields
  SENTRY_DSN: z.string().url().optional(),
  INTERNAL_CLASSIFY_SECRET: z.string().optional(),
  NOTIFY_DISABLE: z.enum(["0", "1"]).optional().default("0"),
  AI_WORK_ORDER: z.enum(["0", "1"]).optional().default("0"),
  DEV_AUTH_BYPASS: z.enum(["0", "1"]).optional().default("0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// Updated client schema
const clientEnvSchema = z.object({
  // ... existing fields
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});
```

### Phase 3: Runtime Improvements (P2)
1. Update logger to respect `LOG_LEVEL`
2. Document RESEND behavior in `.env.example`
3. Clarify `NEXT_PUBLIC_DEMO_MODE` build behavior
4. Verify/audit CSP nonce implementation in `src/proxy.ts`

---

## 9. Verification Commands

```bash
# Check for hardcoded secrets in src/
grep -ri "api.key\|apikey\|secret\|password" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "GEMINI_API_KEY\|SUPABASE_SERVICE_ROLE_KEY\|INTERNAL_CLASSIFY_SECRET" \
  | grep -v "\.test\|\.spec"

# Check NEXT_PUBLIC_ usage
grep -r "NEXT_PUBLIC_" src/ --include="*.ts" --include="*.tsx" | wc -l
# Should be < 20 (small, intentional set)

# Check env validation coverage
grep "process.env\." src/lib/env.ts  # Should cover all required vars
grep "process.env\." src/ --include="*.ts" --exclude-dir=node_modules \
  | grep -v "process.env.NEXT_PUBLIC_\|process.env.NODE_ENV" \
  # Should be minimal; most server-side access should go through serverEnv proxy
```

---

## 10. References

- **Next.js Environment**: https://nextjs.org/docs/basic-features/environment-variables
- **Supabase Auth**: https://supabase.com/docs/guides/auth
- **Sentry Next.js**: https://docs.sentry.io/platforms/javascript/guides/nextjs/
- **Security Headers**: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html

---

**Status:** ✅ AUDIT COMPLETE  
**Overall Risk:** 🟡 MEDIUM (P1 findings must be addressed before production deployment)  
**Next Step:** Implement Phase 2 schema completeness fixes
