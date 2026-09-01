# Lint & Format Audit Report

**Date:** 2026-06-13
**Tool:** Biome 2.0.0
**Scope:** src/ (208 files checked)
**Status:** 387 errors, 56 warnings

---

## Executive Summary

The codebase has systematic formatting violations (CRLF line endings) affecting 264 files, combined with code quality issues across accessibility, import organization, type safety, and style rules. Most issues are **fixable automatically**. Three categories emerge as actionable:

| Category | Count | Severity | Fixable |
|----------|-------|----------|---------|
| **Format (CRLF line endings)** | 264 | P0 | Yes |
| **Import Organization** | 73 | P1 | Yes |
| **Accessibility (a11y)** | 79 | P1 | Partial |
| **Code Quality (lint)** | 80 | P2 | Mixed |

---

## 1. Format Issues (P0) - 264 files

### Root Cause
Files use **CRLF (carriage return + line feed)** line endings instead of LF. This violates the Biome formatter configuration which expects LF.

### Evidence
All 264 format errors show:
- Lines ending with `␍` (CR character)
- Biome suggests removing CR from every line

### Files Affected
- `src/app/[team]/[city]/analytics/page.tsx`
- `src/app/[team]/[city]/layout.tsx`
- `src/app/[team]/[city]/map/page.tsx`
- `src/app/[team]/[city]/page.tsx`
- `src/app/api/ai/classify/route.ts`
- `src/app/api/health/route.ts`
- `src/app/city/[slug]/analytics/page.tsx`
- `src/app/city/[slug]/layout.tsx`
- `src/vitest-globals.d.ts`
- *And 255 more files*

### Fix Strategy
Run a global CRLF→LF conversion:
```bash
# Unix: for each file, strip CR
find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -exec dos2unix {} \;

# Or via Git (cross-platform):
git config --local core.safecrlf false
git add -A
git commit -m "chore: normalize line endings to LF"
```

Or simply run:
```bash
npx biome check --fix src/
```

---

## 2. Import Organization (P1) - 73 issues

### Rule: `assist/source/organizeImports`

### Issue
Imports are not sorted according to Biome's convention:
1. Built-in modules (`react`, `next/*`)
2. First-party (`@/`)
3. Relative (`./*`)

### Examples

**File:** `src/app/city/[slug]/layout.tsx`
```diff
- import { Suspense } from "react";
- import { CityHeader } from "@/components/city-header";
- import { FilterProvider } from "@/lib/filters/context";
- import { getReportCorpus } from "@/lib/dashboard-data";

+ import { Suspense } from "react";
+ import { CityHeader } from "@/components/city-header";
+ import { getReportCorpus } from "@/lib/dashboard-data";  // moved up
+ import { FilterProvider } from "@/lib/filters/context";
```

### Fix
**Automatic:** Run `npx biome check --fix src/` to organize all imports in one pass.

### Impact
- **Scope:** 73 files (mostly in `src/app/`)
- **Risk:** None, pure formatting change
- **Time to fix:** <1 second (automated)

---

## 3. Accessibility (a11y) Issues (P1) - 79 total

### 3.1 Missing Button Type (`lint/a11y/useButtonType`) - 26 issues

**Rule:** Every `<button>` must have an explicit `type` attribute.

**Example:**
```jsx
// WRONG
<button onClick={handleRetry}>Retry</button>

// CORRECT
<button type="button" onClick={handleRetry}>Retry</button>
```

**Affected Files:**
- `src/app/city/[slug]/analytics/error.tsx:16`
- `src/app/city/[slug]/map/error.tsx:16`
- *24 more*

**Fix:**
- Add `type="button"` to all interactive buttons
- Use `type="submit"` for form submission buttons
- Use `type="reset"` for form reset buttons

**Severity:** P1 (WCAG 2.1 Level A - implicit form submission can cause unexpected behavior)

---

### 3.2 Use Semantic Elements (`lint/a11y/useSemanticElements`) - 18 issues

**Rule:** Use semantic HTML elements instead of generic `<div>` when possible.

**Example:**
```jsx
// WRONG
<div role="button" onClick={...}>Click me</div>

// CORRECT
<button>Click me</button>
```

Or for navigation:
```jsx
// WRONG
<div role="navigation">...</div>

// CORRECT
<nav>...</nav>
```

**Affected:** Primarily in interactive components and navigation structures.

**Severity:** P1 (WCAG 2.1 Level A - improves screen reader navigation)

---

### 3.3 Missing ARIA Props (`lint/a11y/useAriaPropsSupportedByRole`) - 8 issues

**Rule:** ARIA attributes must be valid for the element's `role`.

**Example:**
```jsx
// WRONG
<div role="button" aria-checked={true}>Toggle</div>  // aria-checked invalid for button

// CORRECT
<div role="checkbox" aria-checked={true}>Toggle</div>
// OR use <button> + toggle logic
```

**Severity:** P1 (WCAG 2.1 Level A - conflicting ARIA confuses assistive tech)

---

### 3.4 Other a11y Issues (27 total)

- **noStaticElementInteractions** (7): Static elements (e.g., `<div>`) used with event handlers → use semantic elements
- **useKeyWithClickEvents** (5): Elements with `onClick` should also have `onKeyDown` handlers
- **noSvgWithoutTitle** (5): SVGs must have a `<title>` element for screen readers
- **noRedundantRoles** (2): Element has redundant explicit role (e.g., `<button role="button">`)
- **noLabelWithoutControl** (2): `<label>` elements must reference a form control
- **noNoninteractiveTabindex** (4): Non-interactive elements (e.g., `<div>`) given `tabindex` without proper role
- **noAutofocus** (1): Avoid `autofocus` attribute (can surprise users)
- **noRedundantAlt** (1): Image alt text redundantly repeats "image" (e.g., `alt="image of cat"` → `alt="cat"`)

---

## 4. Code Quality Issues (P2) - 80 issues

### 4.1 Array Index as Key (`lint/suspicious/noArrayIndexKey`) - 18 issues

**Rule:** Avoid using array index as React key prop.

**Example:**
```jsx
// WRONG
{items.map((item, index) => <Item key={index} {...item} />)}

// CORRECT
{items.map((item) => <Item key={item.id} {...item} />)}
```

**Why:** If list order changes or items are added/removed, rendering breaks or DOM state persists incorrectly.

**Affected:** Primarily in `components/` files that render lists.

**Severity:** P2 (Can cause subtle React reconciliation bugs; fix by adding unique IDs to data)

---

### 4.2 Global isNaN Usage (`lint/suspicious/noGlobalIsNan`) - 11 issues

**Rule:** Use `Number.isNaN()` instead of global `isNaN()`.

**Example:**
```js
// WRONG
if (isNaN(value)) { }  // coerces to number first: isNaN("foo") → true

// CORRECT
if (Number.isNaN(value)) { }  // strict check: Number.isNaN("foo") → false
```

**Affected Files:** Likely in data processing / calculations.

**Severity:** P2 (Can mask type errors; silently accept strings/null instead of failing loudly)

---

### 4.3 Non-Null Assertions (`lint/style/noNonNullAssertion`) - 12 issues

**Rule:** Avoid TypeScript's non-null assertion operator (`!`).

**Example:**
```ts
// WRONG
const x = value!;  // tells TS to ignore potential null

// CORRECT (if safe)
const x = value ?? fallback;
// OR add proper null checks
if (!value) throw new Error(...);
const x = value;
```

**Severity:** P2 (Bypasses type safety; should be replaced with exhaustive guards or optional chaining)

---

### 4.4 Hook Dependency Issues (`lint/correctness/useExhaustiveDependencies`) - 14 issues

**Rule:** React hooks (useEffect, useMemo, useCallback) must list all external values used in dependency arrays.

**Example:**
```js
// WRONG
useEffect(() => {
  console.log(userId);  // used but not in deps
}, []);

// CORRECT
useEffect(() => {
  console.log(userId);
}, [userId]);
```

**Severity:** P2 (Stale closures → data inconsistency, infinite loops, missed updates)

---

### 4.5 Unused Imports (`lint/correctness/noUnusedImports`) - 4 issues

**Rule:** Remove imports that are declared but never used.

**Example:**
```js
// WRONG
import { notUsed } from "./utils";  // never referenced

// CORRECT
import { foo } from "./utils";
```

**Severity:** P2 (Increases bundle size, hides refactoring; minor impact)

---

### 4.6 Other Code Quality Issues (17 total)

- **useIterableCallbackReturn** (6): Array methods (map, filter) must return a value; don't use void callbacks
- **useHookAtTopLevel** (4): React hooks must be called at the top level of a component, not in loops/conditions
- **noShadowRestrictedNames** (3): Variables shouldn't shadow restricted JS keywords (e.g., `let undefined = ...`)
- **useImportType** (3): Type imports should use `import type { ... }` syntax
- **noImplicitAnyLet** (1): Variable typed as `any` should be explicit or inferred
- **noExplicitAny** (1): Use explicit types instead of `any`
- **useExportType** (1): Type exports should use `export type { ... }` syntax
- **noThenProperty** (1): Don't use `.then()` on non-Promise; likely error in async/await
- **noRedeclare** (1): Variable declared twice in same scope
- **noAssignInExpressions** (1): Avoid assignment inside conditional expressions
- **noDangerouslySetInnerHtml** (1): Using `dangerouslySetInnerHTML` (real risk if HTML is untrusted)
- **noUnusedFunctionParameters** (1): Function parameter declared but never used
- **useOptionalChain** (1): Could simplify null check with optional chaining (`?.`)

---

### 4.7 Style Issues

- **noImportantStyles** (17): Avoid `!important` in CSS/styles
- **noImgElement** (4): Use `<Image>` from Next.js instead of `<img>`
- **useImportType** (3): Type-only imports should use `import type` syntax

---

## 5. Configuration Analysis

### biome.json
```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "files": {
    "includes": ["**", "!**/node_modules", "!**/.next", "!public", "!scripts"]
  }
}
```

**Issues with Config:**
1. `recommended` ruleset enabled (good baseline)
2. Formatter set to 2-space indents (matches project)
3. No line ending enforcement → CRLF files slip through
4. No explicit rule configuration for a11y warnings (all run at default level)

### Recommended Config Additions
```json
{
  "formatter": {
    "lineWidth": 100,
    "indentWidth": 2,
    "lineEnding": "lf"  // Add this to enforce LF
  },
  "linter": {
    "rules": {
      "a11y": {
        "useButtonType": "error",
        "useSemanticElements": "error",
        "useAriaPropsSupportedByRole": "error"
      },
      "correctness": {
        "useExhaustiveDependencies": "error",
        "noUnusedImports": "error"
      }
    }
  }
}
```

---

## 6. Remediation Plan

### Phase 1: Automatic Fixes (P0) - 5 minutes
```bash
cd c:\Hackathon\-Social-Impact-
npx biome check --fix src/
```

**What this fixes:**
- 264 format issues (CRLF→LF)
- 73 import organization issues
- ~40 fixable lint issues (useImportType, unused imports, etc.)

**Result:** ~377 errors → ~47 errors (remaining manual work)

---

### Phase 2: Accessibility Review (P1) - 2-3 hours
Focus on the 79 a11y issues:

1. **useButtonType** (26 issues): Add `type` attributes to all `<button>` elements
2. **useSemanticElements** (18 issues): Replace divs with proper HTML (nav, section, etc.)
3. **ARIA props** (8 issues): Audit and fix invalid ARIA combinations
4. **Other a11y** (27 issues): Address click handlers, SVG titles, label associations

**Tools:**
- VSCode Biome extension to see issues inline
- Manual code review + testing with screen reader (NVDA/JAWS)

---

### Phase 3: Code Quality (P2) - 1-2 hours
Address the 80 remaining code quality issues:

1. **Array index keys** (18): Replace with proper unique IDs
2. **isNaN** (11): Swap for `Number.isNaN()`
3. **Hook dependencies** (14): Audit useEffect/useMemo/useCallback closures
4. **Non-null assertions** (12): Replace with optional chaining or proper null guards
5. **Other** (25): Address as per detailed list above

---

### Phase 4: Config Update (P1) - 15 minutes
```bash
# Update biome.json to prevent future issues
```

Update `lineEnding: "lf"` and elevate critical a11y rules to `error` level.

---

## 7. Timeline & Ownership

| Phase | Task | Effort | Owner | Timeline |
|-------|------|--------|-------|----------|
| **1** | `biome check --fix` | 5 min | Automated | Immediate |
| **2** | a11y fixes | 2-3 hrs | Frontend Lead | This sprint |
| **3** | Code quality | 1-2 hrs | Team | This sprint |
| **4** | Config update | 15 min | Lead | Before next commit |

---

## 8. Risk Assessment

### Low Risk
- Format fixes (CRLF→LF)
- Import organization
- Type import syntax updates

### Medium Risk
- ⚠ Hook dependency fixes (may require logic changes)
- ⚠ Array key replacement (requires data model review)
- ⚠ Semantic HTML refactors (can affect CSS/layout)

### High Risk
- ⛔ Non-null assertion removal (must verify all null paths)
- ⛔ a11y interactive element changes (test with real users)

---

## 9. Validation Checklist

After fixes, run:
```bash
# 1. Verify all linting passes
npx biome check src/ --diagnostic-level=warn

# 2. Run tests to ensure no regressions
npm run test

# 3. Build the app
npm run build

# 4. Visual inspection of key pages
npm run dev
# Manual QA: check analytics, team views, forms, modals

# 5. Accessibility check
# Use: https://wave.webaim.org/ or axe DevTools
# Test in Firefox + NVDA on Windows
```

---

## 10. Future Prevention

1. **Pre-commit hook:** Add Biome check to husky hooks
   ```bash
   npx husky add .husky/pre-commit "npx biome check --fix ."
   ```

2. **CI/CD:** Add linting step to GitHub Actions
   ```yaml
   - run: npx biome check src/
   ```

3. **EditorConfig:** Add `.editorconfig` to enforce line endings
   ```
   [*]
   end_of_line = lf
   ```

4. **VS Code Settings:** Auto-insert type keyword for imports
   ```json
   "[typescript]": {
     "editor.defaultFormatter": "biomejs.biome"
   }
   ```

---

## Summary

| Category | Count | Fixable | Effort |
|----------|-------|---------|--------|
| Format | 264 | 100% | <1s |
| Imports | 73 | 100% | <1s |
| a11y | 79 | 60-80% | 2-3h |
| Code Quality | 80 | 40-60% | 1-2h |
| **Total** | **496** | **~75%** | **3-6h** |

**Recommendation:** Execute Phase 1 immediately (automated), then incrementally address Phases 2-4 over the sprint.
