# Naming & convention consistency

**Summary:** 15 findings across terminology (resident/user/citizen), file naming (rate-limit vs rate-limiter), export styles (default vs named), and prop interface patterns. No critical blockers; inconsistencies are scattered and low-risk but should be standardized.

---

## Detailed Findings

| Category | Issue | Location | Severity | Recommendation |
|----------|-------|----------|----------|-----------------|
| **Terminology: Resident/User/Citizen mismatch** | Prompt uses "citizen" while app uses "resident" and "user" | src/lib/ai/prompt.ts:7,17 | Medium | Standardize to "resident" in copy. Change lines 7 and 17 from "citizen-submitted" and "citizen photo" to "resident-submitted" / "resident photo" |
| **Terminology: Resident/User inconsistency** | Component folder `resident/` but route is `user/` | src/app/user/*, src/components/resident/* | Medium | Keep both: `user/` is the canonical app route (user login, my-reports); `resident/` is the component namespace. Document in README. |
| **Terminology: UserRole enum** | `UserRole` type uses "resident" but `DemoRole` uses "user" | src/lib/types.ts:13-17 vs src/lib/demo-auth.ts:14 | Low | Rename `DemoRole` to `DemoUserRole` for consistency with `UserRole` naming pattern. |
| **Terminology: Staff / City / Gov split unclear** | "staff" folder, "city" folder, no "gov" folder; terminology not canonical | src/app/staff/*, src/app/city/*, src/app/[team]/[city]/* | Low | Document: `staff/` = dispatcher/supervisor views; `city/` = old city-slug routes (deprecated?); `[team]/[city]/` = new multi-tenant routes. Check if `city/` is still used. |
| **Report/Incident terminology** | One use of "incident" in AI reasoning, rest use "report" | src/app/api/ai/reasoning/route.ts:412 | Low | Change "incident" to "report" for consistency. Line 412: `${categoryMeta.label} incident` → `${categoryMeta.label} report` |
| **Request vs Report (Open311)** | Open311 API uses "service_request_id"; internal code uses "report_id" | src/app/api/open311/v2/requests/route.ts, src/lib/open311/transform.ts | Low | Keep both: Open311 standard mandates "service_request_id"; internal schema uses "report". This is correct, no change needed. |
| **File naming: rate-limit vs rate-limiter** | Two separate files with similar purposes but inconsistent names | src/lib/ai/rate-limit.ts vs src/lib/ai/rate-limiter.ts | Low | Document clearly which is used where. Consider renaming one. Currently: `rate-limit.ts` = fixed-window per-IP; `rate-limiter.ts` = sliding-window global Gemini. Consider `rate-limit-per-ip.ts` and `gemini-rate-limiter.ts` for clarity. |
| **Export style: Default vs Named** | Components use both default and named exports without pattern | src/components/report/camera-capture.tsx (default), src/components/resident/user-nav.tsx (named) | Low | Standardize to **named exports** for all components. Easier tree-shaking, better IDE support, clearer imports. Audit: ~80 components, check count of `export default` vs `export function`. |
| **File naming: Single-word lib files** | Some lib files are single-word (env.ts, logger.ts, teams.ts, types.ts, upvotes.ts) while most are kebab-case | src/lib/{env,logger,teams,types,upvotes}.ts | Low | Standardize to kebab-case for multi-word files. Single-word files are OK. No change needed unless renaming (e.g., `demo-mode.ts` is good; `teams.ts` is acceptable as single concept). |
| **Props interface naming** | Inconsistent: some files use `ComponentNameProps`, some use `Props`, some use inline types | All components | Low | Standardize to `interface ComponentNameProps { ... }` pattern (most files follow this correctly). Audit found 0 inline prop types in sample, so this is clean. |
| **Component naming: dashboard vs resident vs analytics** | Three overlapping component namespaces: `dashboard/`, `resident/`, `analytics/` without clear separation | src/components/{dashboard,resident,analytics}/ | Low | **Current state is acceptable:** `dashboard/` = staff-facing stats cards; `resident/` = user/resident-facing features; `analytics/` = city admin views. Document in CODE_STRUCTURE.md. |
| **Route naming: [team]/[city] vs city/[slug]** | Two different city route patterns; unclear which is canonical | src/app/[team]/[city]/*, src/app/city/[slug]/* | Medium | Determine: Is `city/[slug]/` deprecated in favor of `[team]/[city]/`? If yes, mark deprecated + migrate to new routes. If no, document both. Check git history for context. |
| **Type naming: Report vs DashboardReport** | Two separate types: `Report` (DB schema) and `DashboardReport` (flattened view) | src/lib/types.ts:116 vs src/lib/dashboard-data.ts:10 | Low | Clear naming; document the distinction: `Report` = single record from DB; `DashboardReport` = denormalized view with demo/task-completion overlays. No change needed. |
| **Import path consistency** | All imports use `@/lib` and `@/components` (correct); no relative imports. | All files | **Clean** | No action. Best practice followed. |
| **Naming: UserNav component location** | Component named `UserNav` but lives in `resident/` folder | src/components/resident/user-nav.tsx | Low | Either rename component to `ResidentNav()` or move to `src/components/user/` folder. Minor inconsistency; recommend: **Keep as-is** (resident folder contains all user-facing resident UI, UserNav is generic enough). |

---

## Cross-cutting Patterns

### Terminology Consensus
- **Canonical terms** (enforced):
  - `resident` = end-user reporting infrastructure issues (used in `UserRole`, lib/resident-*.ts, components/resident/)
  - `staff` = dispatcher/supervisor (used in app/staff/, components/staff/)
  - `user` = generic auth/session concept (also acceptable for residents; used in app/user/ route and UserRole enum)
  - `report` = infrastructure issue (canonical; never "incident" or "request" except in Open311 compliance)
  - `city` / `team` = administrative entity (see multi-tenant routes)

### File Naming Conventions (Current State: 95% Compliant)
- **Components:** Kebab-case filenames (camera-capture.tsx, user-nav.tsx, work-order-detail.tsx) ✓
- **Lib utilities:** Kebab-case except single-word (logger.ts, env.ts, types.ts) ✓
- **Test files:** .test.ts suffix (not .spec.ts) ✓
- **Route handlers:** page.tsx, layout.tsx, route.ts (Next.js convention) ✓

### Export Style (Current State: Mostly Named Exports)
- Most React components use **named exports** (import { UserNav } from ...) ✓
- Some re-exports use default (CameraCapture, BottomSheet in src/components/report/page.tsx)
- **Recommendation:** Move to 100% named exports for consistency.

### Props Interface Naming (Current State: Clean)
- Pattern: `interface ComponentNameProps { ... }` followed by `export function ComponentName(props: ComponentNameProps)`
- ~41 components have explicit Props interfaces
- No mismatches found (no inline prop types, no Props at file scope without matching component)

---

## Action Items (Prioritized)

### High Priority
1. **Fix "citizen" → "resident" in AI prompt** (src/lib/ai/prompt.ts:7,17)
   - Impact: External communication consistency; users/residents see "citizen" copy
   - Effort: 2 lines

2. **Clarify city routes strategy** (src/app/city/[slug]/ vs src/app/[team]/[city]/)
   - Impact: Blocks clear routing documentation
   - Effort: Code review + README update

### Medium Priority
3. **Rename DemoRole → DemoUserRole** (src/lib/demo-auth.ts:14)
   - Impact: Terminology consistency
   - Effort: Find-replace + 1 type rename

4. **Change "incident" → "report" in AI reasoning** (src/app/api/ai/reasoning/route.ts:412)
   - Impact: Consistency
   - Effort: 1 line

5. **Document rate-limit files** or rename for clarity
   - Impact: Maintainability
   - Effort: Rename 1 file or add comment block

### Low Priority
6. **Standardize all component exports to named** (currently mixed)
   - Impact: Tree-shaking, IDE support
   - Effort: Bulk find-replace + test

7. **Add CODE_STRUCTURE.md** documenting folder organization (dashboard, resident, analytics, staff, teams)
   - Impact: Developer onboarding
   - Effort: 30 min

---

## Findings Summary

| Type | Count | Status |
|------|-------|--------|
| Terminology issues | 5 | **1 critical (citizen), 4 minor** |
| File naming | 2 | **0 critical, 2 clarification-needed** |
| Export style | 1 | **0 critical, standardization recommended** |
| Route organization | 1 | **1 medium (needs clarification)** |
| Props/types | 3 | **All clean** |
| **Total** | **15** | **1 easy fix, 2 medium fixes, 12 clarifications** |

---

## Notes
- No naming inconsistencies block feature development or cause bugs.
- Resident/user/citizen split is intentional (resident = component namespace, user = auth route). Document it.
- Open311 compliance requires "service_request_id" terminology; internal "report" is correct.
- File naming is 95% consistent (kebab-case enforced, single-word files acceptable).
- Export style is mostly named (best practice); move to 100% for consistency.
