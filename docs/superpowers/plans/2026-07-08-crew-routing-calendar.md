# Crew Descriptions + Assignment Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-crew descriptions so the AI can route a work order to the RIGHT crew among several of the same type, plus a staff calendar showing how work orders land across dates, with filters.

**Architecture:** (A) `crews.description` (migration 032) feeds a conditional "## CREWS" prompt section; the work-order AI gains a nullable `crew_hint` (exact crew name) that `autoAssignCrew` prefers before falling back to the deterministic `pickCrew` balancer. (B) A staff-only `/city/[slug]/calendar` route plots work orders by `dispatched_at ?? created_at` (done-styling via `completed_at`) on a hand-rolled month grid with MenuSelect filters, no new dependencies.

**Tech Stack:** Next 16 App Router (RSC page + client calendar), Supabase, zod/v4, existing `MenuSelect`, grayscale staff tokens (`border-hairline`, `bg-surface`, `bg-overlay`, `text-subtle`/`faint`, `--radius-md`, `custom-scrollbar`).

**Model routing (user directive):** Tasks 4-5 (AI routing + assign algorithm) = controller/Fable implements inline. Tasks 1-3, 6, 8 = sonnet subagents. Task 7 (calendar UI) = opus subagent.

**Repo ground rules for every task:** repo-wide `pnpm lint` is RED (~325 pre-existing errors), gate on `pnpm exec biome check <touched files>` only. `pnpm typecheck` must stay clean. Commit with EXPLICIT `git add <paths>`, a parallel session keeps unrelated unstaged files (9× loading.tsx + globals.css); NEVER `-A`/`-u`. Schema pushes to prod are the USER's action. Work directly on `main` is forbidden, branch `feat/crew-routing-calendar` off current main.

---

### Task 1: Migration 032: `crews.description`

**Files:**
- Create: `supabase/migrations/20260708_032_crew_descriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 032: crews.description, per-crew routing blurb.
--
-- crew_types.description (031) tells the AI what a TYPE of labor does; this
-- column differentiates SIBLING crews of the same type ("North side arterial
-- roads" vs "Downtown + parks district") so the work-order generator can emit
-- a crew_hint naming the best-fit crew. Optional. Empty means "no signal,
-- let the load balancer decide" (src/lib/ai/crew-assign.ts).
--
-- No RLS change: crews policies (030) already row-scope by city for staff.

ALTER TABLE crews
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

COMMENT ON COLUMN crews.description IS
  'What distinguishes this crew from same-type siblings (coverage area, specialty). Read by the AI work-order router for crew_hint. Empty = no signal.';
```

- [ ] **Step 2: Commit (file only, DO NOT apply to prod; that is the user's action)**

```bash
git add supabase/migrations/20260708_032_crew_descriptions.sql
git commit -m "feat(db): crews.description for AI crew routing (032, apply pending)"
```

---

### Task 2: Plumb description through DB accessor + crew actions

**Files:**
- Modify: `src/lib/db/crews.ts` (CrewRow + select)
- Modify: `src/app/city/[slug]/members/crew-actions.ts` (create/update schemas + writes)

- [ ] **Step 1: `src/lib/db/crews.ts`**: add `description: string` to `CrewRow` and `CrewRowRaw`, add `description` to the `.select("id, team_key, name, crew_type, active")` list, and map it in the row-building loop with `description: c.description ?? ""` (pre-032 DBs return undefined, the accessor must keep degrading gracefully exactly as it does today; check how the file handles `crew_type` nullability and mirror that defensiveness).

- [ ] **Step 2: `crew-actions.ts`**: in `createCrewSchema` and `updateCrewSchema` (read the file; they exist near the top) add:

```ts
  description: z.string().trim().max(500).optional().default(""),
```

Thread `description` into the `.insert({...})` of `createCrew` and the `.update({...})` of `updateCrew`. IMPORTANT pre-032 safety: if the insert/update errors with a missing-column code (`42703` in `error.code` or "description" + "does not exist" in `error.message`), RETRY the same write without the description key and log a warn. The dialog must keep working before the user applies 032. Extract a small local helper so create and update share it:

```ts
/** Strip description and retry once when the DB predates migration 032. */
function isMissingDescriptionColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    (error.message ?? "").includes("description") &&
      (error.message ?? "").includes("does not exist")
  );
}
```

- [ ] **Step 3: Gates + commit**

Run: `pnpm typecheck && pnpm vitest run src/lib && pnpm exec biome check src/lib/db/crews.ts "src/app/city/[slug]/members/crew-actions.ts"`
Expected: all clean.

```bash
git add src/lib/db/crews.ts "src/app/city/[slug]/members/crew-actions.ts"
git commit -m "feat(crews): thread description through accessor + create/update actions (pre-032 safe)"
```

---

### Task 3: Crew dialog description field (UI)

**Files:**
- Modify: `src/components/crews/crews-panel.tsx`

- [ ] **Step 1:** In the crew create/edit dialog form (the one with Name / Division / Crew type, NOT the inline "New type…" sub-form), add an optional textarea below the Crew type field, matching the file's existing field styling (reuse the exact classes of the inline new-type textarea):

- Label: `Description` with a faint hint span: `optional. Helps the AI pick between same-type crews`
- `aria-label="Crew description"`, `maxLength={500}`, `rows={2}`, placeholder: `e.g. North side arterial roads and school zones`
- State init: editing an existing crew pre-fills from `crew.description` (Task 2 exposed it on `CrewRow`); create starts empty.
- Submit: include `description` in the `createCrew` / `updateCrew` payloads.

- [ ] **Step 2: Gates + commit**

Run: `pnpm typecheck && pnpm exec biome check src/components/crews/crews-panel.tsx`

```bash
git add src/components/crews/crews-panel.tsx
git commit -m "feat(crews): crew description field in dialog (AI routing signal)"
```

---

### Task 4: AI `crew_hint`: schema + conditional prompt section (CONTROLLER/FABLE, implemented inline, not dispatched)

**Files:**
- Modify: `src/lib/ai/work-order-schema.ts` + `.test.ts`
- Modify: `src/lib/ai/prompt.ts` + `.test.ts`

Design (summary for reviewers):
- `aiWorkOrderSchema` + Gemini schema gain `crew_hint: string | null`: REQUIRED nullable field (Gemini structured output: add to `properties` + `required`, type `["string","null"]` matching how `crew_type` nullable is expressed in the file). This is a deliberate schema version bump (tests updated), unlike the zero-drift custom-types builders.
- `buildWorkOrderPrompt` gains an optional `crews` argument: `{ name: string; crewType: string | null; description: string }[]`. Inject a `## CREWS` section ONLY when some crew_type has ≥2 crews AND at least one of those crews has a non-empty description, otherwise the prompt is byte-identical to today (tests enforce). Section instructs: emit `crew_hint` = the EXACT crew name when descriptions clearly indicate a best fit; otherwise `crew_hint: null`. Template-literal composition only (no `String.replace` with user text, `$`-pattern hazard).
- Whitespace-collapse descriptions; cap section at 20 crews (log-free, deterministic slice by name sort).

---

### Task 5: Pipeline + `autoAssignCrew` hint short-circuit (CONTROLLER/FABLE: implemented inline, not dispatched)

**Files:**
- Modify: `src/lib/ai/work-order-ai.ts` (accept + return crew_hint)
- Modify: `src/lib/ai/classify-pipeline.ts` (fetch crews once under AI_WORK_ORDER; thread hint)
- Modify: `src/lib/ai/crew-assign.ts` + `.test.ts` (hint parameter)

Design (summary for reviewers):
- `generateWorkOrderAI(classification, customTypes, crews = [])` passes crews to the prompt builder; `AiGeneratedWorkOrder` gains `crew_hint: string | null`.
- `classify-pipeline`: under `AI_WORK_ORDER`, fetch the city's active crews (`id, name, team_key, crew_type, description`) once, best-effort, `[]` on error; pass to the generator; keep the fetched list in scope and pass `crewHint` into `autoAssignCrew`.
- `autoAssignCrew(supabase, { ..., crewHint?: string | null })`: after loading candidates (same-division same-type active crews), if `crewHint` case-insensitively equals a candidate's name → pick it directly (skip `pickCrew`), log `crew_auto_assign_hint_used`. Invalid/unknown hint → ignore, fall through to `pickCrew` (log `crew_auto_assign_hint_miss`). `pickCrew` itself untouched (issue #16 unaffected).
- Tests: hint match wins over load ranking; hint miss falls back; null hint = today's behavior.

---

### Task 6: Calendar data accessor

**Files:**
- Create: `src/lib/db/calendar.ts`
- Test: `src/lib/db/calendar.test.ts`

- [ ] **Step 1: Write the failing test** (mock the supabase client exactly the way `src/lib/db/crew-types.ts`'s neighbors are tested, read one existing `src/lib/db/*.test.ts` first and copy its mocking pattern):

Cases: (1) happy path maps rows; (2) query error → `{ ok: false }`-style empty result (match the file's chosen contract below); (3) `dispatched_at` null falls back to `created_at` for `calendarDate`.

- [ ] **Step 2: Implement**

```ts
// src/lib/db/calendar.ts
import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db:calendar");

export interface CalendarWorkOrder {
  id: string;
  title: string;            // from joined report
  category: string | null;  // from joined report
  teamKey: string | null;
  crewType: string | null;
  crewId: string | null;
  crewName: string | null;  // joined crews.name
  status: "open" | "completed";
  calendarDate: string;     // ISO date (YYYY-MM-DD) it renders on
  dispatchedAt: string | null;
  completedAt: string | null;
  priorityScore: number | null;
}

/** Work orders for one city over [fromISO, toISO), calendar month window.
 *  Never throws; [] on any failure (un-migrated DB, query error). */
export async function fetchCalendarWorkOrders(
  cityId: string,
  fromISO: string,
  toISO: string,
): Promise<CalendarWorkOrder[]> { /* … */ }
```

Query: `work_orders` select `id, team_key, crew_type, assigned_crew_id, dispatched_at, completed_at, created_at, priority_score, reports!inner(title, category, status, city_id), crews(name)` filtered `.eq("reports.city_id", cityId)`, date-window on `created_at` OR `dispatched_at` overlapping the range (two `.or` filters are fiddly in PostgREST, acceptable simplification: window on `coalesce`-equivalent client-side: fetch `.gte("created_at", <fromISO minus 60 days>)` `.lt("created_at", toISO)` then compute `calendarDate = (dispatched_at ?? created_at)` client-side and drop rows outside `[fromISO, toISO)`). Exclude dead reports (`closed/merged/rejected`, same `DEAD_STATUSES` reasoning as `crew-assign.ts`). `status: completed_at ? "completed" : "open"`. IMPORTANT: verify the actual FK/embed names against another accessor that joins reports before writing the select string.

- [ ] **Step 3: Gates + commit**

Run: `pnpm typecheck && pnpm vitest run src/lib/db && pnpm exec biome check src/lib/db/calendar.ts src/lib/db/calendar.test.ts`

```bash
git add src/lib/db/calendar.ts src/lib/db/calendar.test.ts
git commit -m "feat(calendar): city work-order calendar accessor (dispatched->created fallback)"
```

---

### Task 7: Calendar UI: month grid + filters (OPUS)

**Files:**
- Create: `src/components/calendar/work-order-calendar.tsx` (client component)
- Create: `src/lib/calendar-grid.ts` (pure date math + tests)
- Test: `src/lib/calendar-grid.test.ts`

**Brenda reference (read before building):** `C:\Users\soham\brenda-v5-main`: see scout findings appended to the dispatch prompt for the 2-3 must-read files (grid layout, chip stacking, "+N more" overflow). Port PATTERNS, not code. Civic styling must use its own grayscale staff tokens.

- [ ] **Step 1: Pure grid math first (TDD)**: `src/lib/calendar-grid.ts`: no deps, exports

```ts
export interface CalendarCell { iso: string; inMonth: boolean; isToday: boolean; }
/** 6x7 Monday-start grid covering the month of `anchorISO` (YYYY-MM-DD). */
export function monthGrid(anchorISO: string, todayISO: string): CalendarCell[];
export function addMonths(anchorISO: string, delta: number): string;
export function monthLabel(anchorISO: string): string; // "July 2026"
```

Tests: 42 cells always; correct leading/trailing `inMonth:false` cells for a known month (July 2026 starts Wednesday: grid starts Mon 2026-06-29); `isToday` only on `todayISO`; `addMonths("2026-01-31", 1)` clamps sanely (use day-1 anchoring: always operate on the 1st of the month so clamping never occurs).

- [ ] **Step 2: `work-order-calendar.tsx`**: `"use client"`. Props: `{ slug: string; orders: CalendarWorkOrder[]; crews: {id: string; name: string}[]; crewTypes: {key: string; label: string}[]; teams: {id: string; label: string; color: string}[]; monthISO: string; todayISO: string }`.

Layout:
- Header row: `monthLabel`, prev/next/Today buttons (`<Link>`s that set `?month=YYYY-MM`, RSC refetch, no client fetching), filter bar of four `MenuSelect`s (Division w/ color swatches, Crew type, Crew, Status open/completed) + "Clear filters". Filters are CLIENT state (useState), they filter the already-fetched month's orders.
- Grid: CSS grid `grid-cols-7`, weekday header (Mon, Sun), 6 rows of day cells (`min-h-28`, `border-hairline`, out-of-month cells `text-faint bg-overlay/40`, today cell ring). Cell shows day number + up to 3 chips + `+N more` faint text when overflowing.
- Chip: truncated report title, colored left border 2px using the division color (`teams` prop), `line-through opacity-60` when completed, hover shows `title` attr with full title + crew name. Chip is a `<Link>` to `/city/${slug}/grid` (the work-order surface that exists today, deep-linking a specific order is out of scope; do NOT invent a detail route).
- Empty month state + `role="grid"`/`role="gridcell"` semantics; keyboard = normal tab flow over links (no roving focus, YAGNI).
- Filter logic in a `useMemo`: `orders.filter(o => (!fTeam || o.teamKey===fTeam) && (!fType || o.crewType===fType) && (!fCrew || o.crewId===fCrew) && (!fStatus || o.status===fStatus))`, then bucket by `calendarDate` into a `Map<string, CalendarWorkOrder[]>`, chips sorted by `priorityScore desc nulls-last`.

- [ ] **Step 3: Gates + commit**

Run: `pnpm typecheck && pnpm vitest run src/lib/calendar-grid.test.ts && pnpm exec biome check src/lib/calendar-grid.ts src/lib/calendar-grid.test.ts src/components/calendar/work-order-calendar.tsx`

```bash
git add src/lib/calendar-grid.ts src/lib/calendar-grid.test.ts src/components/calendar/work-order-calendar.tsx
git commit -m "feat(calendar): month grid + filter bar over city work orders"
```

---

### Task 8: Calendar route + nav

**Files:**
- Create: `src/app/city/[slug]/calendar/page.tsx`
- Create: `src/app/city/[slug]/calendar/loading.tsx` (copy the skeleton pattern from `src/app/city/[slug]/members/loading.tsx`, shared `.skeleton` classes)
- Modify: `src/components/city-sidebar.tsx` (staff-gated "Calendar" item)

- [ ] **Step 1: Page**: mirror `src/app/city/[slug]/members/page.tsx`'s structure EXACTLY for: `dynamic = "force-dynamic"`, dual `fetchCityFromDb`/mock city resolve, `getStaffAccessForCity` gate with login redirect (calendar is staff-operational; NO admin requirement, demo access fine, no PII on this surface). Read `searchParams` for `month` (`YYYY-MM`, default = current month from `new Date()` server-side); compute `monthISO = \`${month}-01\``, `todayISO`, and the grid's visible range via `monthGrid` (first/last cell ISO) for the accessor window. Fetch in parallel: `fetchCalendarWorkOrders(dbCity.id, from, to)`, `fetchCityCrews(dbCity.id)` (crew filter options), `fetchCityCrewTypes(dbCity.id)` (type filter options), and the teams/divisions the sidebar/panels already use (find how members/crews pages get team labels+colors and reuse). Render `<WorkOrderCalendar …/>`. Synthetic cities → empty-state card (copy members page's).

- [ ] **Step 2: Sidebar**: in `src/components/city-sidebar.tsx` staff-gated block (after Grid, before Members), add:

```ts
          {
            label: "Calendar",
            href: `/city/${slug}/calendar`,
            icon: CalendarDays,
            active: pathname === `/city/${slug}/calendar`,
          },
```

(`CalendarDays` from `lucide-react`, added to the existing import.)

- [ ] **Step 3: Gates + commit**

Run: `pnpm typecheck && pnpm exec biome check "src/app/city/[slug]/calendar/page.tsx" "src/app/city/[slug]/calendar/loading.tsx" src/components/city-sidebar.tsx`

```bash
git add "src/app/city/[slug]/calendar" src/components/city-sidebar.tsx
git commit -m "feat(calendar): staff calendar route + sidebar entry"
```

---

### Task 9: Full gates + browser QA (CONTROLLER)

- [ ] `pnpm typecheck && pnpm vitest run && pnpm test:rls` all green.
- [ ] Playwright QA (extend the session's `qa-crews.mjs` approach): calendar loads, month nav links work, filters narrow chips, dark mode shot, crew dialog description field round-trips (pre-032: save still succeeds via retry-without-description), sidebar shows Calendar.
- [ ] Fork-collision check (memory `civic-fork-collision-check`): `git fetch origin && git log --oneline main..origin/main` BEFORE merging; reconcile if the other session shipped again.
- [ ] Merge to main + push (SSH), branch pushed too.

---

## Brenda Scout Findings (for Task 7's implementer)

From `C:\Users\soham\brenda-v5-main` (scouted 2026-07-08). **Verdict: port-as-pattern, not code**, their calendar file mixes customer-portal business logic into the grid component.

- **Must-read files:** `src/app/c/[token]/customer-calendar-client.tsx` (~350 lines of pure calendar logic inside an 866-line file: `buildMonthGrid()` 42-cell month math in pure UTC `YYYY-MM-DD` string math, copy-worthy near-verbatim; `DayCell`; `CalendarTile` chip; `DayPopup` modal for overflow), `src/components/schedule/date-nav.tsx` (URL-param `?date=` prev/next/today nav, mirrors this plan's `?month=` Links), `src/components/schedule/risk-filter-store.ts` + `summary-risk-filter.tsx` (toggleable filter-pill pattern, optional alternative to MenuSelect for the status filter).
- **Overflow pattern:** hard cap visible chips per day (`MAX_VISIBLE_PER_DAY = 2-3`) + "+N more" opening a day modal listing the rest. Task 7 MAY implement the modal version (Civic has modal patterns in member-modal.tsx) instead of plain faint text if time allows. Otherwise faint "+N more" text is acceptable v1.
- **No calendar library; no absolute positioning**: plain `grid-cols-7`, chips stack in normal flow. Their styling is hardcoded Tailwind palette classes; restyle entirely with Civic's staff tokens.

## Self-Review Notes

- Spec coverage: per-crew description (T1-T3 storage/UI, T4-T5 AI routing) ✅; "distribution formula" intentionally NOT here (user deferred to issue #16, hint short-circuit only) ✅; calendar + many filters (T6-T8: division/type/crew/status + month nav) ✅; Brenda as reference not dependency (T7) ✅; dispatched/completed dates decision (T6 `calendarDate` fallback + completed styling) ✅; model split honored (headers) ✅.
- Type consistency: `CalendarWorkOrder` defined T6, consumed T7/T8; `CrewRow.description` T2 → T3; `crew_hint` named identically T4/T5.
- Pre-032/031 degradation called out in T2 (retry) and T6/T8 (accessors already `[]`-safe).
