# Test Coverage Audit

**Summary:** 11 test files, ~1,669 lines of tests across 207 .ts/.tsx source files. Excellent coverage of AI pipeline (classify, reasoning, work-order). Critical gaps: no component tests (77 untested), no E2E tests, zero coverage for report submission UI, form validation, error-recovery flows.

## Test Coverage Status

| Area | Test Status | Coverage | Priority | Notes |
|------|-------------|----------|----------|-------|
| AI Pipeline | PASS | 7/7 | None | classify, gemini, reasoning, retry, rate-limit, work-order, schema |
| Report Submission | FAIL | 0% | CRITICAL | 443 lines page.tsx + 244 lines actions.ts untested |
| Auth Login | PARTIAL | 50% | HIGH | demo-auth.test.ts only; login-form.tsx 407 lines untested |
| Components | FAIL | 0% | HIGH | 77 untested: camera, preview, confirmation, analytics, forms |
| Form Validation | FAIL | 0% | HIGH | No zod schema tests, no field validation |
| API Routes | PARTIAL | 10% | HIGH | open311/v2/requests untested (rate-limit, filters, RLS) |
| Data Mutations | FAIL | 0% | HIGH | No DB upserts, photo uploads, rollback tests |
| Error Cases | FAIL | 0% | CRITICAL | HEIC reject, timeout, missing GPS, missing city, auth fail |
| Dashboard Queries | PASS | 70% | Low | dashboard-queries.test.ts covers cache, errors |
| Image Utilities | PASS | 80% | Low | sniff-mime.test.ts covers JPEG/PNG/GIF/WEBP |

## Critical Untested Paths

### 1. Report Submission (CRITICAL)
Files: src/app/report/page.tsx (443 lines), src/app/report/actions.ts (244 lines)

Untested flows:
- GPS location fallback to Cumming GA center (34.2073, -84.1402)
- Photo base64 encoding from Blob (blobToBase64 lines 15-23)
- City resolution and user profile healing (upsert on missing, lines 72-97)
- Storage upload failure cleanup (rollback public if raw fails, lines 127, 161)
- Zod submitReportSchema validation (lat bounds, base64 min-length, lines 11-25)
- Anonymous session creation on mount (lines 81-98)
- Async-classify pending timeout: 20s backstop (line 260)
- Realtime channel subscribe/unsubscribe and applyRow callback (lines 244-340)
- HEIC image format rejection and error UI recovery (lines 164-170)
- State machine: camera → preview → submitting → done/emergency

### 2. Auth Flows (CRITICAL)
Files: src/app/login/login-form.tsx (407 lines)

Missing tests:
- Google OAuth signInWithOAuth() redirect (line 37-43)
- Email/password sign-in (line 56-64)
- Email sign-up with confirmation (line 66-78)
- Guest signInAnonymously() (line 88)
- Mode toggle: signin ↔ signup (line 292, 307)
- Email field: required, format validation, autocomplete
- Password field: required, minLength 8 on signup
- Error display and loading states (busy spinners)
- Redirect query param parsing (line 80-81)
- DEV_PREFILL demo account prefill (line 14-16)

### 3. Data Mutations (HIGH)
Files: src/app/report/actions.ts (lines 45-243)

Untested DB operations:
- Report INSERT with RLS enforcement (SSR client, line 159)
- Photo storage: PUBLIC_BUCKET upload (line 111), RAW_BUCKET (line 122)
- User profile upsert with city_id resolve (lines 87-97)
- Classification INSERT from async background job
- Cascading rollback: public upload succeeds, raw upload fails (lines 127-128)

### 4. Form Validation (HIGH)

Zod schemas untested:
- submitReportSchema: base64 min 1, lat -90..90, lng -180..180, description max 500, tags max 8
- Email: format, required
- Password: required, min 8 on signup

### 5. API Endpoints (HIGH)
File: src/app/api/open311/v2/requests/route.ts

Untested:
- Rate limiting: 60 req/min per IP (line 27-32)
- Pagination: 1-based page, size 1-200 clamp (lines 50-57)
- Date filters: start_date, end_date (lines 82-87)
- Status filter: open/closed expansion (lines 77-79)
- Content negotiation: format=xml -> XML (line 41)
- RLS: PUBLIC_REPORT_SELECT columns only (line 21)
- Error responses: 429, 400, 500

### 6. Error Recovery (CRITICAL)

No tests for:
- HEIC image decode failure (page.tsx line 164-170)
- Anonymous session creation failure (lines 89-95)
- Unauthenticated submit rejection (actions.ts line 64)
- Photo upload network timeout
- DB insert failure with partial state
- City config missing fallback (lines 99-101)
- Realtime subscription timeout → fallback classification (line 260)
- Classification service down (lines 237-239)

## Test Quality Assessment

### Strengths
1. AI Mocking: Excellent vi.mock() isolation (Gemini, Supabase, Sentry)
2. Pure Functions: work-order-rules, sniff-mime tested without mocks
3. Integration Mocks: Accurate Supabase query builder simulation
4. Error Paths: retry.test.ts covers AbortError, classify-pipeline tests DB errors

### Weaknesses
1. Zero Component Tests: 77 components untested, no @testing-library/react
2. No E2E Tests: No Playwright/Cypress, full submission flow untested
3. No Integration Tests: DB clients untested, Supabase RLS not validated
4. No Snapshot Tests: UI components have no regression guards
5. No Performance Tests: No debounce/throttle, effect cleanup validation

## Recommendations (Priority Order)

### P0 - Critical Path Safety (Week 1)
1. Report Submission: test blobToBase64(), GPS fallback, error recovery, state machine
2. Auth Flows: test email/password, OAuth, guest, validation, error display
3. Data Mutations: test DB upsert chain, rollback on fail, RLS enforcement

### P1 - Coverage Expansion (Week 2-3)
4. Component Tests: camera-capture, photo-preview, submission-confirmation
5. API Endpoint Tests: rate-limit, pagination, RLS enforcement
6. Form Validation: zod schemas + UI integration

### P2 - Robustness (Week 4)
7. Error Scenarios: HEIC timeout, network fails, missing GPS
8. E2E Happy Path: login → report → submit → confirmation

## Setup Checklist
- [ ] Install @testing-library/react, @testing-library/user-event
- [ ] Configure vitest: jsdom for components, node for API
- [ ] Mock Supabase Auth SDK
- [ ] Create test helpers: mockSubmitReport(), mockRealtimeChannel()
- [ ] Add coverage threshold: 70% for critical paths
- [ ] Document patterns in CONTRIBUTING.md
