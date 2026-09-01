# Dependency Audit

**Summary:** 24 runtime + 12 dev dependencies audited. **1 P1 finding**: `pg` in devDependencies is unused and should be removed. Heavy client bundles (deck.gl, gsap, cobe, maplibre-gl, react-map-gl) are appropriately deployed: lazy-loaded on dashboard, eager-loaded on dedicated pages. No transitive risks or duplicate-purpose libraries detected.

---

## Findings

| ID | File:Line | Severity | Problem | Fix |
|---|---|---|---|---|
| D1 | package.json:57 | P1 | `pg` (devDependency) is unused | Remove from package.json devDependencies |

---

## Details

### D1: Unused `pg` Dependency (P1)

**Location:** package.json:57

**Problem:** `pg` (Node Postgres client library) is listed in devDependencies but never imported or used anywhere in the codebase.

**Evidence:**
- No imports of `pg` found in src/ (205 source files scanned)
- Not used in supabase/seed/index.ts (uses `@supabase/supabase-js` instead)
- Not used in any config files or build scripts
- Comprehensive grep across all .ts/.tsx/.js/.mjs files found zero matches

**Why it matters:** Dead dependencies bloat lock files, slow installs, and obscure true external API surface for security auditing. The seed script and all DB operations use Supabase client libraries, not raw `pg`.

**Fix:**
```bash
npm remove pg --save-dev
```

---

## Heavy Client Bundles

### Bundle-Heavy Libraries Audit

Audited: deck.gl (5 packages), gsap (2 packages), cobe, maplibre-gl, react-map-gl.

| Package | Imported | Loaded | Used | Bundle Risk |
|---|---|---|---|---|
| @deck.gl/aggregation-layers | yes | eager | HexagonLayer, HeatmapLayer | Mitigated (lazy ReportMap) |
| @deck.gl/core | no | transitive | - | Normal (pulled by layers) |
| @deck.gl/layers | yes | eager | ScatterplotLayer | Mitigated (lazy ReportMap) |
| @deck.gl/mapbox | yes | eager | MapboxOverlay | Mitigated (lazy ReportMap) |
| @deck.gl/react | yes | eager | - | Mitigated (lazy ReportMap) |
| gsap | yes | eager | Direct animation calls | Acceptable (report/team modals only) |
| @gsap/react | yes | eager | useGSAP hook | Acceptable (report/team modals only) |
| cobe | yes | eager | createGlobe | Acceptable (landing page only) |
| maplibre-gl | yes | type-only | StyleSpecification type | No risk (types only) |
| react-map-gl | yes | eager | Map, Popup, useControl | Mitigated (lazy ReportMap) |

**Key Findings:**

1. **Lazy Loading Strategy:** Map components use `next/dynamic` wrapper in src/components/map/report-map-lazy.tsx:5, loaded only when needed (dashboard, browse pages). Eager load is confined to fullscreen-map.tsx and staff map pages. Reasonable for dedicated routes.

2. **GSAP Usage:** Animations in emergency-interstitial.tsx:2, submission-confirmation.tsx:3, delegation-panel.tsx:5, team-setup-modal.tsx:5, workload-bars.tsx:3. These are modal/UI-driven components with legitimate animation needs. Bundle cost is unavoidable if animations are core UX.

3. **COBE (3D Globe):** Loaded in civic-globe.tsx:5 on landing page (app/page.tsx). Visible on landing but not on main app routes, acceptable trade-off.

4. **No Duplicate-Purpose Libraries:** Mapping stack is complementary: maplibre-gl (base), react-map-gl (wrapper), deck.gl (visualization). Animation: gsap + @gsap/react are standard pairing.

---

## Dependency Status by Type

### Runtime Dependencies (24): All Used

@deck.gl/aggregation-layers, @deck.gl/core (transitive), @deck.gl/layers, @deck.gl/mapbox, @deck.gl/react, @google/generative-ai, @gsap/react, @radix-ui/react-accordion, @radix-ui/react-slot, @sentry/nextjs, @supabase/ssr, @supabase/supabase-js, class-variance-authority, clsx, cobe, gsap, lucide-react, maplibre-gl, next, react, react-dom, react-map-gl, tailwind-merge, zod.

**Status:** All used. No undeclared imports found.

### DevDependencies (12): 11 Used, 1 Unused

| Package | Used | Evidence |
|---|---|---|
| @biomejs/biome | yes | biome.json + npm scripts |
| @tailwindcss/postcss | yes | postcss.config.mjs:3 |
| @types/node | yes | TypeScript |
| @types/react | yes | TypeScript |
| @types/react-dom | yes | TypeScript |
| @vitejs/plugin-react | yes | vitest.config.ts:2 |
| eslint | yes | eslint.config.mjs:1 |
| eslint-config-next | yes | eslint.config.mjs:2 |
| **pg** | **UNUSED** | **Never imported** |
| tailwindcss | yes | PostCSS config |
| typescript | yes | tsconfig.json |
| vitest | yes | vitest.config.ts:1 + test files |

---

## Transitive Dependencies

No suspicious transitive imports. @deck.gl/core pulled by @deck.gl/layers (normal). Supabase internal deps (postgres-js, auth-js) are transitive and appropriate.

---

## Duplicate-Purpose Library Check

| Purpose | Libraries | Status |
|---|---|---|
| Vector mapping | maplibre-gl + react-map-gl | Complementary (base + React wrapper) |
| 3D visualization | deck.gl (5 packages) | Single ecosystem |
| Animations | gsap + @gsap/react | Standard pairing |
| Icons | lucide-react | No duplicate |
| UI styling | class-variance-authority, clsx, tailwind-merge | Different purposes |

No redundant libraries.

---

## Backlog

1. **CRITICAL:** Remove `pg` from devDependencies. Run `npm remove pg --save-dev`.

2. **Optional:** Monitor bundle size of deck.gl + gsap on production. Current lazy-loading is appropriate; no change needed if perf budgets met.

3. **Documentation:** Update CLAUDE.md if needed on why pg was removed (Supabase handles all DB ops).

---

## Summary

All 24 runtime dependencies used
1 of 12 devDependencies unused: pg
Bundle-heavy libs appropriately deployed
No duplicate-purpose libraries
No transitive risks

**Action:** Remove pg. Done.
