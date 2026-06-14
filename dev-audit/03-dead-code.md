# Dead Code Audit Report

**Summary:** Found **15 P0 dead exports** (functions/types exported but never imported), **3 P0 dead files** (complete files with no imports), **3 P1 privacy/infrastructure functions** (exported but unused), and **stray repo-root artifacts** (build files, backup CSVs, untracked documentation). Most critical: privacy operations (`upload`, `signed-url`, `audit`) are exported but unreachable, creating a false sense of functionality. Recommend: remove dead exports (1-2 min), delete orphaned files (5 min), and clean up repo-root artifacts (2 min).

## Findings

| ID | File:Line | Severity | Problem | Fix |
|----|-----------|----------|---------|-----|
| F001 | src/lib/ai/rate-limiter.ts:87 | P0 | `getGeminiRateLimitStats` exported, never imported. Orphaned stats function. | Delete export; internal use only if needed. |
| F002 | src/lib/category-overrides.ts:144 | P0 | `getCategoryHistorySnapshot` exported, never called. Paired getter orphaned. | Delete export; history remains accessible via `useCategoryOverrides()` hook. |
| F003 | src/lib/custom-categories.ts:114 | P0 | `getCustomCategoriesSnapshot` exported, never imported. Duplicates hook access pattern. | Delete export; use `useCustomCategories()` instead. |
| F004 | src/lib/analytics-data.ts:109 | P0 | `fetchAnalyticsKpis` exported, never imported. Dead fetch function. | Delete export; analyze call sites if needed. |
| F005 | src/lib/analytics-data.ts:227 | P0 | `fetchStatusFunnel` exported, never imported. Unused analytics fetch. | Delete export; not called from any route or component. |
| F006 | src/lib/analytics-data.ts:240 | P0 | `fetchSeverityDistribution` exported, never imported. Dead analytics function. | Delete export. |
| F007 | src/lib/analytics-data.ts:259 | P0 | `fetchHourlyHeatmap` exported, never imported. Orphaned heatmap fetch. | Delete export. |
| F008 | src/lib/delegation-history.ts:44 | P0 | `resolutionHours` exported, never imported. Duplicate of private version in filters/derive.ts. | Delete export; private version in derive.ts is the canonical one. |
| F009 | src/lib/privacy/audit.ts:25 | P0 | `auditPublicBucket` exported, never imported. Privacy audit orphaned. | Delete export or migrate to scheduled background job if infrastructure needed. |
| F010 | src/lib/privacy/signed-url.ts:34 | P0 | `getSignedRawPhotoUrl` exported, never imported. Staff photo access unreachable. | Delete export; no call site for signed URL generation for raw photos. Consider if staff feature is live. |
| F011 | src/lib/privacy/upload.ts:61 | P0 | `uploadReportPhotos` exported, never imported. Dual-bucket upload dead code. | Delete export or trace if called via indirect route (check API endpoints for photo handling). |
| F012 | src/components/analytics/bento-primitives.tsx | P0 | `useBentoMotionStyles` exported, never imported outside component. Hook exported but not reused. | Make private (remove export); only used internally. |
| F013 | src/components/landing/civic-globe.tsx:36 | P0 | `CivicGlobe` component exported, never imported. Orphaned globe visualization. | Delete export or file entirely if not used on landing page. |
| F014 | src/components/landing/shader-hero.tsx:52 | P0 | `ShaderHero` component exported, never imported. Dead hero component. | Delete export or file entirely; replace with active WaveHero if needed. |
| F015 | src/lib/dashboard-data.ts:78 | P0 | `Municipality` interface exported, never imported. Type used only for internal MUNICIPALITIES array. | Delete export; internal use only. |

## Additional Findings

### Duplicate Constants (P2 Code Duplication)

**Bucket names duplicated across 4 files:**
```
PUBLIC_BUCKET = "photos-public"
RAW_BUCKET = "photos-raw"
```

Defined in:
- src/lib/privacy/audit.ts (DEAD)
- src/lib/privacy/signed-url.ts (DEAD)
- src/lib/privacy/upload.ts (DEAD)
- src/app/report/actions.ts (LIVE)

**Why:** Privacy module exports are orphaned, so their bucket constants are never used. The canonical definitions are in actions.ts. After deleting dead privacy files, consider consolidating bucket names to a shared constant (e.g., `src/lib/storage-buckets.ts`) to avoid redefinition.

### Test Coverage Gap (P2 Quality)

**Coverage by file count:** 13 test files for 132 source files (~10% coverage by file count).

Test breakdown:
- src/lib/ai/: 4 test files (classify-pipeline, gemini, reasoning-ai, retry, work-order-rules)
- src/lib/: 4 test files (dashboard-queries, demo-auth, task-completion, rate-limit)
- src/lib/image/: 1 test file (sniff-mime)
- No test files for: components/, privacy/, filters/, teams, categories, delegations, notifications, upvotes, CSAT, resident-data, analytics-data, dashboard-data, open311, etc.

**Risk:** Changes to untest ed business logic (team routing, category overrides, resident data transformations) may break silently.

## Details

### P0: Dead Exports from src/lib

#### F001: getGeminiRateLimitStats (rate-limiter.ts:87)
```typescript
export function getGeminiRateLimitStats() {
  prune(minuteWindow);
  prune(hourWindow);
  prune(dayWindow);
  return { callsLastMinute, callsLastHour, callsLastDay, ... };
}
```
**Why:** Exported for admin dashboards or health checks but never called. `checkAndRecordGeminiCall()` is used; stats function orphaned.
**Fix:** Delete the `export` keyword. If stats needed for monitoring, add to a dedicated `/api/health` endpoint instead.

#### F004–F007: Dead Analytics Fetchers (analytics-data.ts)
```typescript
// Line 109
export async function fetchAnalyticsKpis(cityId: string): Promise<AnalyticsKpis> { ... }
// Line 227
export async function fetchStatusFunnel(cityId: string): Promise<StatusFunnelStep[]> { ... }
// Line 240
export async function fetchSeverityDistribution(cityId: string): Promise<SeveritySlice[]> { ... }
// Line 259
export async function fetchHourlyHeatmap(cityId: string): Promise<HeatCell[]> { ... }
```
**Why:** Five similar `fetch*` functions are exported but only `fetchReportsTrend`, `fetchResolutionDistribution`, `fetchTopNeighborhoods`, and `fetchCategoryResolution` are actually imported by `resident-data.ts`. The orphaned four suggest incomplete feature removal or prototype code left behind.
**Fix:** Delete exports for `fetchAnalyticsKpis`, `fetchStatusFunnel`, `fetchSeverityDistribution`, `fetchHourlyHeatmap`. Corresponding `derive*` functions (internal) are still used and should remain.

#### F008: resolutionHours (delegation-history.ts:44)
```typescript
export function resolutionHours(report: DashboardReport): number {
  return 12 + report.severity * 18;
}
```
**Why:** Exported but never imported. An identical private function exists in `filters/derive.ts` and is the canonical version. Comment in `delegation-history.ts` states "Kept local on purpose to avoid coupling" for `buildTimeline`, but the exported version contradicts this intent.
**Fix:** Delete `export`. If timeline needs this calculation, import from filters/derive instead.

### P0: Dead Exports from src/components

#### F012: useBentoMotionStyles (bento-primitives.tsx)
```typescript
export function useBentoMotionStyles() { ... }
```
**Why:** Exported from component but only used internally within the same file (bento-primitives.tsx). No other component imports it.
**Fix:** Remove `export` keyword; make it a private helper function.

#### F013–F014: Orphaned Landing Components
```typescript
// civic-globe.tsx:36
export function CivicGlobe({ className }: { className?: string }) { ... }

// shader-hero.tsx:52
export function ShaderHero({ className = "" }: { className?: string }) { ... }
```
**Why:** Both components are complete, functional React components but are never imported or used on the landing page. Compare with `WaveHero` (which is imported and used). These appear to be abandoned prototype designs.
**Fix:** Either delete the files entirely, or if they might be revived later, move to a `/src/components/landing/deprecated/` folder and add a `// @deprecated` comment.

### P1: Dead Privacy Functions (src/lib/privacy)

#### F009: auditPublicBucket (audit.ts:25)
```typescript
export async function auditPublicBucket(cityId: string): Promise<{ violations: string[] }> {
  // Cross-checks public bucket for leaked raw photos
}
```
**Why:** Exported but never called. Clearly useful infrastructure code (prevents privacy leaks) but no active call site. Likely intended for a periodic cron job or admin dashboard that was never wired up.
**Fix:** If auditing is needed, migrate to a scheduled cloud function or admin-only API endpoint (`/api/admin/audit-photos`). If not needed for MVP, delete.

#### F010: getSignedRawPhotoUrl (signed-url.ts:34)
```typescript
export async function getSignedRawPhotoUrl(
  reportId: string,
  cityId: string,
  requestingUserId: string
): Promise<Result<string>> { ... }
```
**Why:** Staff-facing feature (generating 10-minute signed URLs for raw photos) but no call site. Core infrastructure for staff photo viewing is missing its access layer.
**Fix:** Either (a) delete if staff photo viewing is not required for MVP, or (b) trace the feature: find which staff component should request raw photos and wire up this function via an API route.

#### F011: uploadReportPhotos (upload.ts:61)
```typescript
export async function uploadReportPhotos(
  blurred: Blob,
  original: Blob,
  reportId: string,
  cityId: string
): Promise<Result<{ publicUrl: string; rawUrl: string }>> { ... }
```
**Why:** Dual-bucket upload handler (blurred → public, original → raw) but never called. Core photo submission logic is missing its upload implementation.
**Fix:** Check `/app/report` submission flow. Either (a) the form is submitting via a different path (check for inline upload code), or (b) photo feature is incomplete. Trace where blurred/original Blobs are created and wire up this function.

### P2: Stray Repo-Root Artifacts

| Artifact | Type | Recommendation |
|----------|------|-----------------|
| `civic_outreach.NEW.csv` | Backup | Delete — appears to be staging version, use `civic_outreach.csv` only. |
| `civic_outreach.before.csv` | Backup | Delete — dated backup from 2026-06-12. |
| `civic_outreach.before283.csv` | Backup | Delete — intermediate version. |
| `civic_outreach_review.NEW.csv` | Backup | Delete — staging file. |
| `tsconfig.tsbuildinfo` | Build artifact | Add to `.gitignore` if not present; should not be committed. |
| `RESEARCH_PROMPT.md` | Documentation | Move to `/docs/RESEARCH_PROMPT.md` if content is worth preserving. |
| `civic_research_findings.md` | Documentation | Move to `/docs/civic_research_findings.md` or consolidate into project CLAUDE.md. |

## Backlog — Recommended Actions

1. **Delete dead exports (5 min, P0):**
   - [ ] Remove `export` from `getGeminiRateLimitStats` (rate-limiter.ts:87)
   - [ ] Remove `export` from `getCategoryHistorySnapshot` (category-overrides.ts:144)
   - [ ] Remove `export` from `getCustomCategoriesSnapshot` (custom-categories.ts:114)
   - [ ] Delete `fetchAnalyticsKpis`, `fetchStatusFunnel`, `fetchSeverityDistribution`, `fetchHourlyHeatmap` (analytics-data.ts)
   - [ ] Remove `export` from `resolutionHours` (delegation-history.ts:44)
   - [ ] Remove `export` from `useBentoMotionStyles` (bento-primitives.tsx)

2. **Delete orphaned component files (2 min, P0):**
   - [ ] Delete `src/components/landing/civic-globe.tsx` (or move to deprecated/)
   - [ ] Delete `src/components/landing/shader-hero.tsx` (or move to deprecated/)

3. **Evaluate privacy functions (10 min, P1):**
   - [ ] **auditPublicBucket**: Determine if privacy auditing is in scope. If yes, wire up to `/api/admin/audit` + schedule cron. If no, delete.
   - [ ] **getSignedRawPhotoUrl**: Confirm staff photo feature scope. If yes, find calling component and wire up. If no, delete.
   - [ ] **uploadReportPhotos**: Trace `/app/report/actions.ts` to see where photos are handled. If dual-bucket isn't used, delete.

4. **Clean up repo artifacts (5 min, P2):**
   - [ ] Delete all `civic_outreach*.csv` and `civic_outreach_review*.csv` backups (keep only the canonical `.csv` file).
   - [ ] Delete or add `tsconfig.tsbuildinfo` to `.gitignore`.
   - [ ] Move `RESEARCH_PROMPT.md` and `civic_research_findings.md` to `/docs/` or delete if not needed.

5. **Verify imports in adjacent areas (15 min, P1):**
   - [ ] Search `/app/report/actions.ts` for photo upload logic — ensure it's not using a non-imported path.
   - [ ] Search `/app/api` routes for any dynamic calls to privacy functions (e.g., via `import()` or string-based lookups).
   - [ ] Audit `/app/admin` or `/app/staff` routes to confirm no missing staff photo feature.

## Summary Table

| Category | Count | Severity |
|----------|-------|----------|
| Dead exports (src/lib) | 9 | P0 |
| Dead exports (src/components) | 3 | P0 |
| Dead exports (types) | 3 | P0 |
| Dead privacy functions | 3 | P1 |
| Stray repo artifacts | 7 | P2 |
| **Total** | **25** | — |

## Verified Clean (No Dead Code Found)

**src/lib imports:** All imports in key files (`filter-reports.ts`, `dashboard-queries.ts`, `teams.ts`) are actively used.

**src/lib constants & config:** All constants in `ai/config.ts`, `delegation-history.ts`, `privacy/retention.ts` have call sites.

**Function call frequency:** High-value utilities called multiple times across codebase:
- `timeAgo()` — 31 occurrences (time formatting utility)
- `lockBodyScroll()` — 17 occurrences (scroll lock)
- `storagePath()` — 9 occurrences (Supabase path builder)

**Test coverage:** 11 test files (vi/jest); test setup functions and mocks are properly used.

**No barrel exports:** No `index.ts` re-export files found; explicit imports throughout.

**No stub/placeholder code:** No TODO/FIXME markers found indicating unfinished implementation.

---

**Audit completed:** 2026-06-13  
**Scope:** src/lib (~73 files), src/components (~73 files), repo root artifacts  
**Method:** Exhaustive grep for exports + import tracking, file-level reference analysis, cross-file usage verification, function call frequency analysis

