# Team View + Demo Auth — Design Spec

**Date:** 2026-06-05
**Status:** Awaiting user approval
**Branch:** perf/dev-speed

## Goal

Two coupled features for the Civic hackathon demo:

1. **Team view** — a team-scoped surface at `/[team]/[city]` (e.g. `/streets_roads/cumming`) showing only that team's tasks, a team-filtered map, team analytics, and the ability to **mark a task done with an after-photo** (before/after). Mirrors the existing City view's chrome and reuses its components.
2. **Demo auth + seeded personas** — a sign-in screen with pre-created demo accounts that route each persona to its view: a resident user, a city/admin, and one account per team.

Both run on the app's existing **demo data path** (`getReportCorpus()` + localStorage overlays). No new backend tables.

## Non-Goals

- Real authentication / authorization. Demo credentials are plaintext in code, gate nothing sensitive, and must never ship to production as-is.
- New-account registration for the demo personas (login only; seeded accounts).
- Hard route gating / role-based lockouts (soft routing only — every URL stays open).
- Propagating completion into the **server-rendered** Staff inbox (Supabase path). Client surfaces that read the shared corpus do propagate.
- Multi-city team views. City is fixed to `cumming` (the only `KNOWN_CITIES` entry).

## Decisions (confirmed with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Done propagation | **Propagate everywhere** — completion resolves through the shared client corpus, so City + Team views both reflect it. |
| 2 | Team URL slug | **Raw team id** (`/streets_roads/cumming`). Ids are already URL-safe; no slug map. |
| 3 | In-view team switcher | **Locked to URL team** — no switcher; "no other team things". |
| 4 | Auth mechanism | **Demo credential map + cookie** session; soft routing. |
| 5 | Sign-up scope | **Login only** — seeded accounts; no registration. |
| 6 | Route gating | **Soft** — login routes to persona home; all URLs stay open. |
| 7 | Team accounts | `teamtest1..11` → `TEAM_LIST` order (excluding `all`), city `cumming`, password `teamtest`. |

## Seeded demo accounts

| Username | Password | Role | Lands on |
|----------|----------|------|----------|
| `usertest` | `usertest` | user | `/user/pulse` |
| `admintest` | `admintest` | admin (city) | `/city/cumming` |
| `teamtest1` | `teamtest` | team `streets_roads` | `/streets_roads/cumming` |
| `teamtest2` | `teamtest` | team `sidewalks_ada` | `/sidewalks_ada/cumming` |
| `teamtest3` | `teamtest` | team `stormwater` | `/stormwater/cumming` |
| `teamtest4` | `teamtest` | team `water_utilities` | `/water_utilities/cumming` |
| `teamtest5` | `teamtest` | team `street_lighting` | `/street_lighting/cumming` |
| `teamtest6` | `teamtest` | team `traffic_engineering` | `/traffic_engineering/cumming` |
| `teamtest7` | `teamtest` | team `parks_forestry` | `/parks_forestry/cumming` |
| `teamtest8` | `teamtest` | team `graffiti_abatement` | `/graffiti_abatement/cumming` |
| `teamtest9` | `teamtest` | team `code_enforcement` | `/code_enforcement/cumming` |
| `teamtest10` | `teamtest` | team `environmental_services` | `/environmental_services/cumming` |
| `teamtest11` | `teamtest` | team `general_admin` | `/general_admin/cumming` |

Team mapping is derived programmatically: `TEAM_LIST.filter(t => t.id !== "all")[n-1]` for `teamtest{n}`. No hand-maintained list.

## Architecture

### Routing

```
src/app/[team]/[city]/
├── layout.tsx          → validate params → notFound(); <TeamHeader> + <FilterProvider lockedTeam> + <main>
├── page.tsx            → Tasks tab (default): hero + <TeamTasksInteractive>
├── map/page.tsx        → team-filtered map (reuse ReportMapLazy / FullscreenMapOrchestrator)
└── analytics/page.tsx  → team-filtered analytics (reuse AnalyticsInteractive)
```

**Route-conflict analysis (verified):** `[team]` is the *only* root-level dynamic segment. Static siblings (`city`, `user`, `staff`, `login`, `report`, `auth`, `api`) win their literal first segment; `[team]` matches any other two-segment path. The second-level dynamic names differ by branch (`city/[slug]` vs `[team]/[city]`) and live in separate parents, so there is **no** Next.js "different slug names at the same level" error. Constraint: a team id may not collide with a reserved first segment — none of the 11 snake_case ids do.

**Validation:** `layout.tsx` resolves params; if `!isValidTeamId(team)` or `!(city in KNOWN_CITIES)` → `notFound()`. Add `generateStaticParams()` for the 11 teams × `cumming` so the routes prerender like the city view.

### Demo auth

New `src/lib/demo-auth.ts` (server-safe, no `"use client"`):

```ts
export type DemoRole = "user" | "admin" | "team";
export interface DemoAccount {
  username: string;
  password: string;          // DEMO ONLY — plaintext, never real auth
  role: DemoRole;
  teamId?: TeamId;           // present iff role === "team"
  home: string;              // post-login redirect target
  label: string;             // human label for the persona picker
}
export const DEMO_ACCOUNTS: DemoAccount[];   // usertest, admintest, teamtest1..11 (generated)
export function authenticateDemo(username: string, password: string): DemoAccount | null;
export const DEMO_SESSION_COOKIE = "civic_demo_session";
```

- `teamtest{n}` rows are generated from `TEAM_LIST` at module load — single source of truth.
- **Session helpers** (server): `getDemoSession()` reads the cookie via `next/headers` `cookies()`, returns the matched `DemoAccount | null`. Used for the header's persona label + logout, not for gating.

**Server action** `src/app/login/actions.ts`:
```ts
"use server";
export async function signInDemo(username, password): Promise<{ error?: string }>
  // authenticateDemo → on success: cookies().set(DEMO_SESSION_COOKIE, username, {httpOnly, sameSite, path:"/"}) → redirect(account.home)
export async function signOutDemo(): Promise<void>  // delete cookie → redirect("/login")
```

**Login screen** (`login-form.tsx`, additive): keep Google/guest/Supabase email. Add a clearly-labeled **"Demo sign-in"** block:
- username + password inputs bound to `signInDemo`,
- a **persona quick-pick** row (chips: User · City Admin · Team 1…11) that prefill the fields and submit — fast on-stage switching.
The block is gated behind `process.env.NODE_ENV !== "production"` plus a visible "Demo accounts" label, consistent with the existing `DEV_PREFILL` pattern.

### Completion overlay store

New `src/lib/task-completion.ts` — exact clone of the `teams-overrides.ts` pattern (module-level snapshot read synchronously by derives + `useSyncExternalStore` for React + quota-safe localStorage):

```ts
const STORAGE_KEY = "civic.task_completion.v1";
interface Completion { completedAt: string; afterPhoto?: string }   // presence ⇒ done
type CompletionMap = Record<string /*reportId*/, Completion>;

export function getCompletionsSnapshot(): CompletionMap;
export function getReportCompletion(report, map?): Completion | undefined;
export function resolveReportStatus(report, map?): ReportStatus;     // map[id] ? "closed" : report.status
export function useTaskCompletion(): {
  completions: CompletionMap;
  markDone: (report, afterPhotoDataUrl?: string) => void;
  reopen: (report) => void;
  clearAll: () => void;
};
```

**Photo quota:** an after-photo is downscaled before storage — new `src/lib/utils/downscale-image.ts` (canvas → max ~1280px longest edge, JPEG q≈0.7, target ≲150 KB data URL). If `lib/privacy` already exposes a resize during the report-blur flow, reuse it instead of adding a new util. `writeStorage` swallows `QuotaExceededError` (in-memory snapshot still drives the session), mirroring the existing stores.

### Done propagation (single source of truth)

The one wiring touch is `FilterProvider` (`src/lib/filters/context.tsx`), which already merges demo reports into `corpus` (lines 52-56) and subscribes to overrides. Extend the `corpus` memo to also resolve completion:

```ts
const { completions } = useTaskCompletion();
const corpus = useMemo(() => {
  const merged = demoReports.length ? [...demoReports, ...baseCorpus] : baseCorpus;
  if (!Object.keys(completions).length) return merged;
  return merged.map(r => {
    const c = completions[r.id];
    return c ? { ...r, status: "closed" as ReportStatus, afterPhoto: c.afterPhoto, completed_at: c.completedAt } : r;
  });
}, [demoReports, baseCorpus, completions]);
```

Because **both** City and Team layouts wrap children in `FilterProvider`, every downstream consumer (`filterReports` → map, KPI bento, trend, status funnel, lists) sees the closed status and the after-photo with **zero component changes**. `DashboardReport` gains two additive optional fields:

```ts
afterPhoto?: string;     // resolution photo data URL (demo)
completed_at?: string;
```

### Team locking

Add an optional prop to `FilterProvider`:

```ts
lockedTeam?: TeamId;
```
- Initial filter: `lockedTeam ? { ...parsed, team: lockedTeam } : parsed`.
- `setFilter` / `patch`: when `lockedTeam` set, force `team: lockedTeam` (ignore changes to team).

The team layout passes `lockedTeam={teamId}`; the city layout omits it (unchanged behavior). This guarantees "no other team things" across every reused surface in the team route.

### Components

**Clone (thin):**
- `team-header.tsx` ← `city-header.tsx` — same fixed chrome/logo/liquid-glass, but shows the team's `label` + `color` + icon (`TEAMS[teamId]`, `TeamIcon`), and a small account/logout affordance reading `getDemoSession()`.
- `team-nav.tsx` ← `city-nav.tsx` — three tabs: **Tasks** (`/[team]/[city]`) · **Map** (`…/map`) · **Analytics** (`…/analytics`).

**New:**
- `team-tasks-interactive.tsx` — reads `useFilteredReports()` (already team + completion scoped), renders the task list (reusing `recent-reports` / `work-order-row` visual patterns + `Badge` statuses). Open tasks first; done tasks show a before/after thumbnail. Row click → detail.
- `team-task-detail.tsx` — `BottomSheet` (mobile) / `Drawer` (desktop), `DashboardReport`-shaped, lifting the visual pattern from the unwired resolution-photo block in `work-order-detail.tsx`. Contents: **Before** = `report.photo_public_url`; **Mark done** button; **After** capture = `<input type="file" accept="image/*" capture="environment">` → downscale → `markDone(report, dataUrl)`. Once done: side-by-side Before/After + closed badge + completed time + a **Reopen** affordance.

**Reused zero-touch:** `ReportMapLazy` / `FullscreenMapOrchestrator`, `AnalyticsInteractive` + KPI bento, `LiquidGlassCard`, `Badge`, `BottomSheet`, `Drawer`, `Button`, `TeamIcon`.

## Data flow

```
login (signInDemo) ──set cookie──> redirect to persona home
        │
        ▼
/[team]/[city] layout: validate → FilterProvider(corpus=getReportCorpus(), lockedTeam=teamId)
        │
        ├─ corpus memo: base + demoReports, each resolved through completions (status/afterPhoto)
        ├─ filterReports(corpus, {team: lockedTeam, …})  ← team-scoped list
        │
        ├─ Tasks  → TeamTasksInteractive → TeamTaskDetail → markDone(report, afterPhoto)
        │                                                        │
        │                                            useTaskCompletion → localStorage civic.task_completion.v1
        │                                                        │
        │                                            (emits → FilterProvider re-derives → list/map/analytics update)
        ├─ Map      → ReportMapLazy(reports = filtered)
        └─ Analytics→ AnalyticsInteractive (filtered)

City view (/city/cumming) shares the same corpus resolution → shows the task closed + after-photo too.
```

## Error handling & edge cases

- Invalid `[team]` or `[city]` → `notFound()`.
- localStorage quota on after-photo → caught; session keeps the in-memory snapshot (photo persists until reload). Downscale keeps this rare.
- SSR/hydration: completion + locked-team stores follow the existing frozen-empty server-snapshot pattern (`useSyncExternalStore` server snapshot = `EMPTY`), so first CSR matches SSR; post-mount hydrate emits.
- Bad/expired demo cookie (username not in `DEMO_ACCOUNTS`) → treated as logged-out; no crash.
- Reopen a done task → `reopen(report)` deletes the completion → status reverts to corpus value everywhere.

## Testing

- **Unit (vitest):** `authenticateDemo` (valid/invalid, all 13 personas, team mapping = `TEAM_LIST` order); `resolveReportStatus` (with/without completion); `downscale-image` output under size budget (jsdom/canvas mock or skip-if-unavailable); generated `DEMO_ACCOUNTS` length = 13 and homes well-formed.
- **Integration (vitest + RTL where present):** `FilterProvider` with a completion → `filtered` shows `closed`; `lockedTeam` forces `filter.team` even after `patch({team: …})`.
- **Manual / gstack-browse:** sign in as each persona → lands on correct home; team view shows only that team's reports; mark a task done with a photo → before/after renders, marker flips closed on the team map AND on `/city/cumming`.

## Build order

1. **Demo auth** — `demo-auth.ts`, `login/actions.ts`, `login-form.tsx` demo block + persona picker, logout. Independently demoable (routes to existing views).
2. **Completion store + FilterProvider wiring** — `task-completion.ts`, `downscale-image.ts`, `DashboardReport` fields, `FilterProvider` corpus-resolution + `lockedTeam`.
3. **Team route group** — `[team]/[city]/{layout,page,map,analytics}`, `team-header`, `team-nav`.
4. **Task list + detail** — `team-tasks-interactive`, `team-task-detail` (mark done + before/after + downscale).

Each step is independently verifiable (typecheck + the app boots) before the next.

## Files

**New:** `src/app/[team]/[city]/layout.tsx`, `…/page.tsx`, `…/map/page.tsx`, `…/analytics/page.tsx`; `src/lib/demo-auth.ts`; `src/app/login/actions.ts`; `src/lib/task-completion.ts`; `src/lib/utils/downscale-image.ts` (if no reusable resize); `src/components/teams/team-header.tsx`, `team-nav.tsx`, `team-tasks-interactive.tsx`, `team-task-detail.tsx`.

**Touched:** `src/lib/filters/context.tsx` (completion resolution + `lockedTeam`); `src/lib/dashboard-data.ts` (`DashboardReport` additive fields); `src/app/login/login-form.tsx` (demo block).
