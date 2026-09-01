# Security Audit: Civic Infrastructure Reporting Platform
Date: 2026-06-13
Scope: Auth (Supabase), RLS, Crypto, API, Privacy, Demo Mode

## CRITICAL (P0): Demo-Blocking
src/app/api/open311/v2/requests/route.ts:72-74
  - service_code filter returns ALL rows (no `!inner`)
  - Fix: Add .inner() to eq() call
  
src/app/api/open311/v2/requests/route.ts:278-282
  - classify fetch fire-and-forget (unawaited)
  - Fix: Wrap in after() to ensure serverless runs to completion
  
src/lib/demo-auth.ts + src/app/login/actions.ts
  - Demo credentials hardcoded, plaintext, always validated
  - Fix: Add `if (NODE_ENV !== "development") return error()` in signInDemo()

src/app/report/actions.ts:87,110-129
  - Service-role bypasses RLS on users.upsert() and storage uploads
  - Fix: Use SSR client or add SECURITY DEFINER trigger for city_id validation

## HIGH (P1): Pre-Production
src/lib/db/client.ts + migrations/...001.sql:314-315
  - cities SELECT USING (true) allows anonymous enumeration
  - Fix: Restrict to active = true or authenticated only

src/app/api/ai/classify/route.ts:16-21
  - Timing-safe compare checks length before hashing (length oracle)
  - Fix: Hash both sides first, then timingSafeEqual()

src/lib/privacy/blur.ts:77-94
  - Fallback blurs thirds only; center-frame faces leak (FaceDetector unavailable)
  - Fix: Use MediaPipe or blur entire frame as fallback

supabase/migrations/20260527_003_storage_rls_and_fixes.sql:39-46
  - Storage RLS allows ANY authenticated user to upload to ANY city (no path check)
  - Fix: Apply migration 006 or add server-side validation

src/app/api/open311/v2/requests/route.ts:154-159
  - API key check correct, but env var missing → silent failure
  - Fix: Fail-fast at startup if INTERNAL_CLASSIFY_SECRET is unset

## MEDIUM (P2): Design Issues
src/proxy.ts:162-170
  - Role source divergence: proxy reads app_metadata, app reads public.users.role
  - Fix: Unify to public.users.role everywhere

src/app/api/open311/v2/requests/route.ts:238-248
  - media_url validated https only (no domain whitelist) → SSRF/phishing
  - Fix: Whitelist to *.supabase.co only or add SSRF-safe hostname validation

src/app/report/actions.ts:57
  - Hardcoded fallback city (Cumming) if GPS unavailable → fingerprint risk
  - Fix: Require GPS or manual address; don't default

src/lib/demo-auth.ts
  - Demo accounts plaintext in bundle (risk if code reused in prod)
  - Fix: Ensure DEMO_MODE="0" via build config, not .env.local

src/app/api/ai/classify/route.ts:62-75
  - Object-level auth returns 404 (correct), but RLS fragmentation could undermine
  - Fix: Unify role source (see P2 above)

## LOW (P3): Future Hardening
src/proxy.ts:41-62
  - CSP img-src includes picsum.photos (external seed host)
  - Fix: Use local files or storage-only in prod

src/lib/ai/gemini.ts
  - Deprecated @google/generative-ai SDK
  - Fix: Migrate to @google/genai (roadmap)

src/lib/env.ts:43-47
  - Lazy env validation defers errors to request time
  - Fix: Eager validation at startup

## STRENGTHS
✅ RLS default-deny on all tables
✅ Helper functions use SECURITY DEFINER correctly
✅ No SQL injection (Supabase parameterization)
✅ Secrets never exposed to client (GEMINI_API_KEY, SERVICE_ROLE_KEY)
✅ CSP with nonce for inline scripts (correct for App Router)
✅ HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers set
✅ Constant-time comparison on Open311 API key (correct pattern)
✅ Dashboard view strips PII (no reporter_id, description, email)
✅ Auth cookies httpOnly, sameSite

## COMPLIANCE GAPS
- WCAG 2.1 AA audit not completed (due 2026-04-24 for city govts >50k)
- DELETE /api/account (CCPA right-to-be-forgotten) not implemented
- Privacy crons (30-day raw TTL) not wired

## PRODUCTION CHECKLIST
- [ ] DEMO_MODE=0 (build-time only)
- [ ] All secrets in Vercel env vars
- [ ] Migration 006 applied (storage folder scoping)
- [ ] Migration 007 applied (classify_status)
- [ ] Audit P0/P1 fixes merged
- [ ] RLS regression tests passed
- [ ] Backup retention policy set
- [ ] Sentry monitoring enabled
- [ ] Rate limits verified on /api endpoints

## PRIORITY FIX ORDER
Day 1 (P0): service_code !inner, classify await, demo NODE_ENV check
Day 2 (P1): timing oracle, storage RLS, blur accuracy, media_url whitelist
Roadmap: role unification, CCPA DELETE, WCAG audit, privacy crons

## RISK SUMMARY
Auth/Sessions: 🟡 MEDIUM (demo creds, role divergence, logout missing)
RLS/Authz: ✅ STRONG (default-deny, but cities SELECT too open, storage RLS missing)
Crypto: 🟡 DECENT (timing oracle, otherwise correct)
API Security: 🔴 HIGH RISK (filter, fetch, media_url)
Privacy: 🟠 MEDIUM RISK (blur accuracy, hardcoded city, EXIF)
Demo Mode: 🔴 CRITICAL (credentials in code)
Data Exposure: 🟡 MITIGATED (service-role by design; RLS is the gate)

OVERALL: MEDIUM-HIGH RISK. Do NOT deploy to production without P0 fixes.
