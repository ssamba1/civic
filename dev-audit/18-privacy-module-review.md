# Privacy module review

**Summary:** 6 files audited. 8 findings: 2 high-severity (unimplemented audit hook, undeployed retention cron), 3 medium (fallback detection gap, contentType mismatch, unsigned raw URLs), 3 low (documentation, type safety). Blur and upload validation are solid; signed-URL expiry is correct; path-matching audit strategy is sound but unused.

---

## Detailed findings

| Severity | File | Line(s) | Category | Issue | Impact | Mitigation |
|----------|------|---------|----------|-------|--------|-----------|
| **HIGH** | `retention.ts` | 1-71 | Enforcement | Retention cleanup SQL is exported but never deployed | Raw photos stay in `photos-raw` indefinitely; 30-day TTL is stated goal but not enforced | Migration 007+ must include `RETENTION_CLEANUP_SQL` or manually execute it. No evidence of deployment in migration files (001-009 checked). |
| **HIGH** | `audit.ts` | 25-72 | Audit completeness | `auditPublicBucket()` function exported but never invoked | Potential raw photo leaks to public bucket go undetected; "leak verification" promise in header (line 4) is dead code | Wire into admin dashboard or scheduled cron job; call on manual trigger or daily schedule. Currently zero observability. |
| **MEDIUM** | `blur.ts` | 15-19 | Fallback detection | Middle third of frame NOT blurred when native `FaceDetector` unavailable | Centre-framed faces reach public bucket unredacted on Firefox, Safari, iOS Safari, and Chrome without the Shape Detection API flag (majority of mobile users per line 8) | Product decision acknowledged in header but no longer-term path: Web Detection API is experimental. Consider fallback to full-frame blur (hiding issue) or MediaPipe (requires model bundle). |
| **MEDIUM** | `upload.ts` | 92 | Upload validation | Original photo uploaded with `contentType: original.type` (blob.type from browser) | Browser-inferred MIME type is trivially spoofable (user renames file.jpg to file.pdf). Sniff validation (line 35-50) is bypassed for raw bucket upload | Change line 92 to hardcoded `contentType: "image/jpeg"` to match `bitmapToJpeg()` output promise (blur.ts:145-150). |
| **MEDIUM** | `signed-url.ts` | 21 | Path disclosure | Raw photo storage path exposed in action response (line 111 in actions.ts) | `rawUrl: "${RAW_BUCKET}/${path}"` returns unencrypted path; adversary knowing reportId can infer city/storage structure. Signed URLs (10min expiry) are correct but path should be opaque | Return minimal metadata; compute full signed URL server-side before returning to client. Or: use opaque report attachment token. |
| **LOW** | `blur.ts` | 99-123 | Blur quality | `ctx.filter = "blur(24px)"` applied via CSS filter on canvas 2D context | CSS filters on canvas 2D are not standardized CSS filters, they have higher compatibility variance than dedicated `createImageData`-based blur. Some contexts may not apply or degrade | Document supported contexts; test on target browsers (mobile especially). Consider `OffscreenCanvas` for predictability. |
| **LOW** | `blur.ts` | 183 | Fallback logic | Line 183: `faceRegions = faces && faces.length > 0 ? faces : [fallbackRegions(width, height)[0]];` uses only top third; plateRegions (line 186) still blurs bottom | Intentional design but comment at line 15 says "MIDDLE third is not blurred", should clarify that bottom (plate) IS blurred even in fallback | Clarify comment or restructure to show full fallback: top + bottom thirds, MIDDLE exposed. Current code is correct; docs are unclear. |
| **LOW** | `face-detector.d.ts` | 1-32 | Type declarations | `face-detector.d.ts` is correct TypeScript but lands at runtime | No export in index.ts or auto-import; devs must manually import and declare. Index file should export for DX | Add `export * from './face-detector.d.ts'` to a privacy/index.ts or clarify manual import in PLAN.md. |

---

## Pass notes (security-relevant, verified clean)

1. **Blur application BEFORE storage (line 159 in page.tsx, before submitReport):** Blurred blob is client-processed via `blurFacesAndPlates()` and base64-encoded before any network call. ✓ Invariant held.
2. **Signed URL expiry (signed-url.ts:12):** 10-minute TTL is appropriate for staff-only raw photo access. Verified in `getSignedRawPhotoUrl()` via `SIGNED_URL_EXPIRY_SECONDS = 10 * 60`. ✓ Correct.
3. **Upload MIME validation (upload.ts:35-50):** Two gates (blob.type allow-list + magic-byte sniff via `sniffImageMime()`). ✓ Solid.
4. **RLS on storage.objects (migration 003:24-46):** Public bucket world-readable; raw bucket restricted to `staff_dispatcher`, `staff_supervisor`, `admin` roles. ✓ Policies are correct.
5. **Dual-bucket invariant (upload.ts:7):** Public bucket gets blurred, raw gets original. Rollback on raw failure (line 98). ✓ Cleanup handled.
6. **Audit size-matching heuristic (audit.ts:59-62):** Comparing file sizes to detect raw-photo leaks is sound, blurred WebP is always smaller due to information loss. ✓ Logic is valid (unused, but correct).
7. **Server-side audit log (migration 003:55-72):** Audit trigger uses sentinel UUID `00000000-0000-0000-0000-000000000000` for service-role writes (auth.uid() is null). ✓ Forensic trail preserved.

---

## Non-findings (clarifications)

- **No EXIF stripping:** `bitmapToJpeg()` (normalize.ts) draws decoded bitmap to canvas, which strips EXIF by design (no re-encode of metadata). ✓ Safe.
- **No double-blur:** Only blurred version is encoded as WebP (line 193-197); original JPEG is re-encoded but NOT blurred (by design, staff need clarity). ✓ Correct split.
- **No raw-to-public race:** Public upload (line 77-86 in upload.ts, or actions.ts:110-115) always precedes raw upload (line 88-94 or actions.ts:120-125). If raw fails, public is rolled back (line 98 or actions.ts:127). ✓ No orphans.

---

## Deployment status

- **Blur logic (blur.ts):** Live. Called from page.tsx:159 before submit.
- **Upload (upload.ts):** Dual path: browser (upload.ts) for front-end demo, server (actions.ts:110-129) for production. Server path in use.
- **Signed URLs (signed-url.ts):** Exported but **never called** in grep scan (0 call sites found). Likely intended for admin dashboard (not yet shipped).
- **Audit (audit.ts):** Exported, never called. Dead code.
- **Retention (retention.ts):** SQL exported, never deployed. 30-day TTL is aspirational, not enforced.

---

## Recommendations (priority order)

1. **DEPLOY retention cron (HIGH):** Backfill migration 008 or 009 to include RETENTION_CLEANUP_SQL execution. Verify via Supabase UI that `cleanup_expired_raw_photos` function exists and cron job is scheduled.
2. **WIRE audit hook (HIGH):** Call `auditPublicBucket()` from admin dashboard on-demand, or add scheduled cron check (daily, 04:00 UTC, after cleanup). Surface violations to ops alerts.
3. **FIX contentType on raw upload (MEDIUM):** Line 92 in upload.ts and line 123 in actions.ts: hardcode `"image/jpeg"` (or infer from blob.type AFTER sniff validation).
4. **DOCUMENT fallback gap (MEDIUM):** Update blur.ts:15 comment to explicitly state "middle third exposed when detector unavailable" and link to fcamera-ai-pipeline-plan.md for roadmap.
5. **DESIGN signed-url response (MEDIUM):** Decide on path opacity vs. transparency; if opaque, return signed URL directly instead of path; update actions.ts:111 and UI that consumes it.
6. **TEST blur on target platforms (LOW):** Validate canvas CSS filter support (iOS Safari, Chrome mobile, Firefox Android).

---

## Code snippets (for reference)

**Blob type spoofing risk (upload.ts:92):**
```typescript
// CURRENT (line 92):
contentType: original.type,  // browser-inferred, spoofable

// RECOMMENDED:
contentType: "image/jpeg",   // matches bitmapToJpeg() output
```

**Fallback detection comment (blur.ts:15-19):**
```typescript
// CURRENT:
// KNOWN LIMITATION: with no detector the MIDDLE third is not blurred...

// CLARIFIED:
// KNOWN LIMITATION: with no detector the MIDDLE third is exposed (top & bottom
// thirds blurred via fallbackRegions). Center-framed faces can reach public
// bucket unredacted on Firefox, Safari, iOS Safari. See fcamera-ai-pipeline-plan.md.
```

**Retention not deployed:**
- `retention.ts` exports `RETENTION_CLEANUP_SQL` (line 34-70).
- No migration file (001-009) invokes it.
- Raw photos never auto-deleted; 30-day TTL is stated but not enforced.

**Audit never wired:**
- `audit.ts` exports `auditPublicBucket()` (line 25-72).
- Zero call sites in codebase.
- No dashboard integration, no cron job, no scheduled check.

---

## Summary table

| Module | File | Status | Findings | Blocker? |
|--------|------|--------|----------|----------|
| Blur | blur.ts | Live | 2 low (fallback gap, filter clarity) | No |
| Upload validation | upload.ts | Live | 2 medium (contentType, path) | No, affects UAT/prod but code works |
| Signed URLs | signed-url.ts | Exported, not used | 1 medium (path opaque) | Not blocking (feature not shipped) |
| Audit | audit.ts | Exported, never called | 1 high (dead code) | Yes, blocks observability |
| Retention | retention.ts | Exported SQL, not deployed | 1 high (no enforcement) | Yes, blocks 30-day TTL promise |
| Type declarations | face-detector.d.ts | Correct, not exported | 1 low (DX) | No |

---

**Report generated:** 2026-06-13  
**Auditor:** Privacy module static review (file:line citations verified)
