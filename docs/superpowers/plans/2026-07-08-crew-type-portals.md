# Crew-Type Portals + Demo Logins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Every crew type gets its own portal (`/city/[slug]/crew/[crewType]`) and its own demo login, scoped so the crew sees only the reports/work-orders relevant to its trade.

**Architecture:** Mirrors the team subtree exactly: a route-level `FilterProvider` lock scopes every reused surface (dashboard, map, calendar). Crew types span divisions (e.g. `cleanup` serves 3 teams), so the lock is a **category set** (derived from the rules-engine category→crew_type table), not a team. Demo personas extend the existing generated-accounts pattern (`teamtest*` → `crewtest*`) with a new `"crew"` role riding the same HMAC demo cookie. Soft scoping by design, same philosophy as team views (`demo-auth.ts` header comment); hard RLS enforcement is future work, documented, not attempted here.

**Tech Stack:** Next 16 App Router, existing FilterProvider/MenuSelect/WorkOrderCalendar, no new deps, no schema changes.

**Model routing:** T1-T3 sonnet, T4 opus (UI), T5 controller.
**Ground rules:** branch `feat/crew-portals` off main; `pnpm lint` repo-wide is RED (~325 pre-existing) (gate on `pnpm exec biome check <touched>`; `pnpm typecheck` stays clean; explicit `git add` paths only (parallel-session unstaged files exist) NEVER -A/-u); commit per task.

---

### Task 1: Category→crew mapping + portal helper

**Files:**
- Modify: `src/lib/ai/work-order-rules.ts` (new export, zero behavior change)
- Create: `src/lib/crew-portal.ts` + `src/lib/crew-portal.test.ts`

- [ ] Step 1: In `work-order-rules.ts`, right after the `RULES` table, add (adapt the value type to the file's actual `WorkOrderRule["crew_type"]`):

```ts
/** Category → rules-engine crew type, for surfaces that scope BY CREW TYPE
 *  (crew portals). Derived from RULES so it can never drift from dispatch. */
export const CATEGORY_CREW_TYPES: Readonly<Record<ReportCategory, CrewType | null>> =
  Object.fromEntries(
    (Object.entries(RULES) as [ReportCategory, WorkOrderRule][]).map(
      ([cat, r]) => [cat, r.crew_type],
    ),
  ) as Record<ReportCategory, CrewType | null>;
```

- [ ] Step 2 (TDD): `src/lib/crew-portal.ts`: isomorphic, no server-only:

```ts
import { CATEGORY_CREW_TYPES } from "@/lib/ai/work-order-rules";
import { DEFAULT_CREW_TYPE_KEYS, crewTypeLabel } from "@/lib/crew-types";
import type { ReportCategory } from "@/lib/types";

/** Report categories whose rules-engine dispatch lands on this crew type. */
export function categoriesForCrewType(crewType: string): ReportCategory[] {
  return (Object.entries(CATEGORY_CREW_TYPES) as [ReportCategory, string | null][])
    .filter(([, c]) => c === crewType)
    .map(([cat]) => cat);
}

/** Valid portal slugs = the built-in crew types (city customs have no rules
 *  categories yet, so a portal for them would always be empty). */
export function isPortalCrewType(v: string): boolean {
  return (DEFAULT_CREW_TYPE_KEYS as readonly string[]).includes(v);
}

export function portalLabel(crewType: string): string {
  return crewTypeLabel(crewType) ?? crewType;
}
```

Tests: paving → contains "pothole"; cleanup → ≥2 categories (graffiti, illegal_dump, debris, assert actual RULES values, read the table first); unknown type → []; every DEFAULT_CREW_TYPE_KEYS entry except any type RULES never emits → non-empty (check reality, adjust); isPortalCrewType true/false cases. Verify `crewTypeLabel` signature in `src/lib/crew-types.ts` before use (it takes `(key, types?)` and returns `string | null`).

- [ ] Step 3: `pnpm vitest run src/lib/crew-portal.test.ts src/lib/ai` green (rules tests must be untouched-green), `pnpm typecheck`, scoped biome. Commit: `feat(crew-portal): category→crew-type mapping + portal helpers`.

---

### Task 2: `lockedCategories` on FilterProvider

**Files:**
- Modify: `src/lib/filters/context.tsx`
- Modify: `src/components/filters/filter-bar.tsx`

- [ ] Step 1: Read `context.tsx` fully. Add `lockedCategories?: ReportCategory[]` to `FilterProviderProps`, mirroring `lockedTeam`'s THREE interception points exactly: initial state seeds `categories: lockedCategories` (context.tsx:~103), `setFilter` force-overwrites `next.categories` back to it (~121), `patch` same (~131). Expose `lockedCategories` read-only on the context value alongside `lockedTeam` (~209-213). Referential stability: memo the array (e.g. `useMemo(() => lockedCategories, [lockedCategories?.join(",")])` or accept it as a stable prop from an RSC, check how lockedTeam avoids re-render loops first).

- [ ] Step 2: `filter-bar.tsx`: where `lockedTeam` renders a static badge + hides the team section (~313, ~351, ~697-699), do the analog for categories: when `lockedCategories` is set, hide the category checkboxes section and show a static badge (`portalLabel`-style text passed via existing context, a simple "Scoped to <n> categories" count badge is fine; match the lockedTeam badge's styling classes exactly).

- [ ] Step 3: `pnpm typecheck`, `pnpm vitest run src/lib/filters` (if tests exist; else full `src/lib`), scoped biome. Commit: `feat(filters): lockedCategories provider lock (crew-portal scoping)`.

---

### Task 3: Demo crew logins

**Files:**
- Modify: `src/lib/demo-auth.ts` + `src/lib/demo-auth.test.ts`
- Modify: `src/components/auth/demo-sign-in.tsx`

- [ ] Step 1: `demo-auth.ts`: `DemoRole` gains `"crew"`; `DemoAccount` gains optional `crewType?: string` (present iff role === "crew"). After `TEAM_ACCOUNTS`, generate:

```ts
// One account per built-in crew type, crewtest1..N, same single-source-of-
// truth pattern as TEAM_ACCOUNTS: adding a default crew type adds a login.
const CREW_ACCOUNTS: DemoAccount[] = DEFAULT_CREW_TYPES.map((t, i) => ({
  username: `crewtest${i + 1}`,
  password: "crewtest",
  role: "crew" as const,
  crewType: t.key,
  home: `/city/${DEMO_CITY}/crew/${t.key}`,
  label: `${t.label} Crew`,
}));
```

(import `DEFAULT_CREW_TYPES` from `@/lib/crew-types`, verify isomorphic, it is). Append to `DEMO_ACCOUNTS`. `isDemoStaffAccount` includes `"crew"` (crew personas are operational staff for the demo city, same as teams).

- [ ] Step 2: `demo-sign-in.tsx`: read it; the quick-fill chips build from `DEMO_ACCOUNTS`. Group the crew accounts under their own visual group/heading ("Crew portals") if the component already groups by role (~32, ~97 have `a.role === "team"` ternaries); otherwise just ensure chips render sensibly (7 more chips). Keep markup style identical.

- [ ] Step 3: extend `demo-auth.test.ts` (read existing cases first): authenticateDemo("crewtest1","crewtest") → role crew + crewType paving + home `/city/cumming/crew/paving`; isDemoStaffAccount(crew account) === true; DEMO_ACCOUNTS has no duplicate usernames (add if not present).

- [ ] Step 4: gates + commit: `feat(demo): per-crew-type demo logins (crewtest1..N)`.

---

### Task 4: Crew portal routes (OPUS)

**Files:**
- Create: `src/app/city/[slug]/crew/[crewType]/layout.tsx`
- Create: `src/app/city/[slug]/crew/[crewType]/page.tsx`
- Create: `src/app/city/[slug]/crew/[crewType]/calendar/page.tsx`
- Create: `src/app/city/[slug]/crew/[crewType]/map/page.tsx`
- Modify: `src/components/calendar/work-order-calendar.tsx` (locked-type prop)
- Create: `src/components/crews/crew-portal-header.tsx` (small banner)

READ FIRST: `src/app/city/[slug]/team/[teamId]/layout.tsx` + its 3 pages (the exact pattern to mirror), `src/lib/crew-portal.ts` (T1), FilterProvider changes (T2), `src/app/city/[slug]/calendar/page.tsx` (calendar assembly to reuse).

- [ ] Step 1 layout: mirror team layout verbatim except: validate `isPortalCrewType(crewType)` else `notFound()`; `FilterProvider` gets `lockedCategories={categoriesForCrewType(crewType)}` (NO lockedTeam, crew types span divisions).

- [ ] Step 2 overview page: metadata `Civic | <city>, <portalLabel> Crew`; render `<CrewPortalHeader crewType label categories/>` (banner: crew name, one-line "You're seeing only <label>-relevant reports", category chips) above `<DashboardInteractive />` (the same context-driven component the city overview uses, verify its import path/props from `src/app/city/[slug]/page.tsx` and reuse EXACTLY; it reads everything from the locked context).

- [ ] Step 3 map page: mirror `team/[teamId]/map/page.tsx` but pass no team (read that file; `CorpusMapView` takes teamId only for label/color, pass nothing or a neutral variant, check its props).

- [ ] Step 4 calendar page: reuse the city calendar page's server assembly (month param, fetches) but: add `lockedCrewType?: string` prop to `WorkOrderCalendar`, when set, `fType` is forced to it (initialize state to it and hide the Crew-type MenuSelect entirely; a controlled constant, not just a default). Orders stay month-fetched; the lock only pins the client filter. Keep the city calendar route's behavior byte-identical when the prop is absent.

- [ ] Step 5 sidebar: NO sidebar changes (portal inherits city chrome exactly like team views; personas land here via `home`).

- [ ] Step 6: gates (`pnpm typecheck`, scoped biome, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/city/cumming/crew/paving` → 200, and `/crew/bogus` → 404) + commit: `feat(crew-portal): crew-type portal routes (overview, calendar, map)`.

---

### Task 5: Gates + QA + ship (CONTROLLER)

- [ ] `pnpm typecheck && pnpm vitest run` green; scoped biome across branch files.
- [ ] Playwright QA: login page shows crewtest chips; POST login as crewtest1 → redirected to `/city/cumming/crew/paving`; portal shows banner + dashboard; filter bar category section replaced by badge; calendar page hides type filter; `/crew/bogus` 404s; dark shot.
- [ ] Fork-collision check (`git fetch origin && git log main..origin/main`), reconcile if needed; merge to main, push SSH; update memory + STATE docs.

## Self-Review Notes
- "own portal": T4 route per crew type ✅. "own login": T3 crewtest1..N ✅. "see only what they need": T2 lockedCategories scoping every context surface + T4 calendar type lock ✅ (soft, documented, same trust level as existing team views).
- Type seams: `categoriesForCrewType`/`isPortalCrewType`/`portalLabel` defined T1, consumed T4; `lockedCategories` defined T2, consumed T4; `crewType` on DemoAccount defined T3, standalone.
- Custom city crew types: portals limited to built-ins (custom types have no category mapping yet). `isPortalCrewType` gate + plan note; extension = future issue.
