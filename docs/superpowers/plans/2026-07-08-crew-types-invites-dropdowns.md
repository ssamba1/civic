# Custom Crew Types + Crew Email Invites + Unified Staff Dropdowns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let city admins define custom crew types (with a ≥10-word description the AI uses for routing), invite crew members by email directly from the crew dialog, and replace the staff console's native `<select>`s with one consistent, polished popover-listbox component.

**Architecture:** Custom crew types live in a new per-city config table `city_crew_types` (migration 031, follows the 024/030 idiom: city-scoped, staff RLS). A single shared module `src/lib/crew-types.ts` becomes the source of truth for the 7 built-in types and all name/description validation, consumed by the UI, the server actions, and the AI schema. The Gemini work-order generator gets per-call schema/prompt builders that union the built-ins with the city's custom types — with zero custom types the output is byte-identical to today's, so existing cities see no behavioral drift. A new `MenuSelect` component (portal-positioned listbox, `aria-activedescendant` pattern) replaces the staff console's native selects and hosts the "+ New type…" creation flow. Crew email invites reuse the existing `inviteMember` action (which already handles no-account users via `supabase.auth.admin.inviteUserByEmail`), extended to return the new `userId` so the crew dialog can add the invitee to its roster immediately.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS), zod v4, Tailwind v4 (grayscale staff register: `border-hairline`, `bg-overlay`, `bg-surface`, `text-subtle`/`text-faint`), Vitest, Gemini via `@google/generative-ai` structured output.

**User decisions locked in (do not re-litigate):**
- Custom types remembered per-city, created inline from the dropdown ("+ New type…").
- Creating a custom type REQUIRES a description of at least 10 words (the AI routing signal).
- Dropdown = custom popover listbox, staff console only (`ui/select.tsx` resident register untouched).
- Crew email invitees default to role `staff_dispatcher`, team = the crew's division.
- AI routing ships in this same build (schema + prompt widening).

**Hard rules that bind this work (from agents.md):**
- Migrations are spec-critical: ONLY the new file `supabase/migrations/20260708_031_city_crew_types.sql` may be added; never edit existing migrations.
- `lib/ai/*` changes must be additive: zero custom types ⇒ identical prompt + schema (tests enforce this).
- Server actions return tagged results `{ ok: true, ... } | { ok: false, error }`.
- RLS on the new table; `pnpm test:rls` must pass.
- No `any` without a one-line comment.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/crew-types.ts` | Create | Built-in crew type list, name normalization, description validation, labels — single source of truth |
| `src/lib/crew-types.test.ts` | Create | Unit tests for the above |
| `supabase/migrations/20260708_031_city_crew_types.sql` | Create | `city_crew_types` table + RLS |
| `src/lib/db/crew-types.ts` | Create | `fetchCityCrewTypes(cityId)` — never throws, `[]` on un-migrated DB |
| `src/app/city/[slug]/members/crew-actions.ts` | Modify | `createCrewType` action; relax `crewTypeSchema` to validated free text |
| `src/app/city/[slug]/members/actions.ts` | Modify | `inviteMember` returns `userId` |
| `src/components/ui/menu-select.tsx` | Create | The popover listbox component |
| `src/components/members/member-modal.tsx` | Modify | `RoleSelect` / `TeamSelect` re-implemented on `MenuSelect`; new error copy |
| `src/components/crews/crews-panel.tsx` | Modify | Division + Crew-type on `MenuSelect`; new-type sub-form; invite-by-email roster flow |
| `src/app/city/[slug]/members/page.tsx` | Modify | Fetch + pass `crewTypes` to `CrewsPanel` |
| `src/lib/ai/work-order-schema.ts` | Modify | `buildGeminiWorkOrderSchema` / `buildAiWorkOrderSchema` builders |
| `src/lib/ai/work-order-schema.test.ts` | Create | Zero-custom equality + custom-accepted tests |
| `src/lib/ai/prompt.ts` | Modify | `buildWorkOrderPrompt(customTypes)` |
| `src/lib/ai/prompt.test.ts` | Create | Zero-custom equality + injection tests |
| `src/lib/ai/work-order-ai.ts` | Modify | Accept `customTypes`, use builders, widen `crew_type` to `string \| null` |
| `src/lib/ai/classify-pipeline.ts` | Modify | Fetch city custom types, thread into `generateWorkOrderAI` |
| `src/lib/types.ts` | Modify | Widen `WorkOrder.crew_type` (verify current shape first) |
| `tests/rls/` (existing harness file) | Modify | RLS coverage for `city_crew_types` |

---

### Task 1: Shared crew-type module (source of truth + validation)

The 7 built-in type strings are currently duplicated in THREE files (`crews-panel.tsx:45`, `crew-actions.ts:19`, `work-order-schema.ts:13`). This task consolidates them and adds the validation logic every later task imports. Pure logic — fully unit-testable.

**Files:**
- Create: `src/lib/crew-types.ts`
- Test: `src/lib/crew-types.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/crew-types.test.ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CREW_TYPES,
  crewTypeLabel,
  descriptionWordCount,
  isBuiltInCrewType,
  MIN_TYPE_DESCRIPTION_WORDS,
  normalizeCrewTypeName,
} from "./crew-types";

describe("BUILT_IN_CREW_TYPES", () => {
  it("contains exactly the 7 AI labor types", () => {
    expect([...BUILT_IN_CREW_TYPES]).toEqual([
      "paving",
      "line_crew",
      "sign_crew",
      "cleanup",
      "concrete",
      "arborist",
      "drain_crew",
    ]);
  });
});

describe("normalizeCrewTypeName", () => {
  it("lowercases, trims, and snake_cases spaces", () => {
    expect(normalizeCrewTypeName("  Street Lights ")).toBe("street_lights");
  });
  it("collapses runs of whitespace/underscores", () => {
    expect(normalizeCrewTypeName("street   __ lights")).toBe("street_lights");
  });
  it("returns null for invalid input", () => {
    expect(normalizeCrewTypeName("")).toBeNull();
    expect(normalizeCrewTypeName("a")).toBeNull(); // too short
    expect(normalizeCrewTypeName("has!bang")).toBeNull(); // bad char
    expect(normalizeCrewTypeName("x".repeat(41))).toBeNull(); // too long
  });
});

describe("isBuiltInCrewType", () => {
  it("recognizes built-ins and rejects customs", () => {
    expect(isBuiltInCrewType("paving")).toBe(true);
    expect(isBuiltInCrewType("street_lights")).toBe(false);
  });
});

describe("descriptionWordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(descriptionWordCount("fixes broken street lights and poles")).toBe(6);
    expect(descriptionWordCount("  a  b  ")).toBe(2);
    expect(descriptionWordCount("")).toBe(0);
  });
  it("MIN_TYPE_DESCRIPTION_WORDS is 10", () => {
    expect(MIN_TYPE_DESCRIPTION_WORDS).toBe(10);
  });
});

describe("crewTypeLabel", () => {
  it("renders underscores as spaces", () => {
    expect(crewTypeLabel("line_crew")).toBe("line crew");
    expect(crewTypeLabel("street_lights")).toBe("street lights");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `-Social-Impact-/`): `pnpm vitest run src/lib/crew-types.test.ts`
Expected: FAIL — module `./crew-types` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/crew-types.ts
/* ==================================================================
   Crew types — single source of truth.

   The 7 built-in labor types are what the AI work-order generator
   knows natively (they were previously duplicated in crews-panel,
   crew-actions, and work-order-schema). Cities can add CUSTOM types
   (city_crew_types table, migration 031); a custom type carries a
   >=10-word description that gets injected into the AI prompt so the
   generator can route work orders to it.

   Shared by client (crew dialog) and server (actions, AI schema) —
   keep this module dependency-free and isomorphic.
   ================================================================== */

export const BUILT_IN_CREW_TYPES = [
  "paving",
  "line_crew",
  "sign_crew",
  "cleanup",
  "concrete",
  "arborist",
  "drain_crew",
] as const;

export type BuiltInCrewType = (typeof BUILT_IN_CREW_TYPES)[number];

/** A city-defined crew type as stored in city_crew_types. */
export interface CityCrewType {
  name: string;
  description: string;
}

export const MIN_TYPE_DESCRIPTION_WORDS = 10;
export const MAX_TYPE_DESCRIPTION_CHARS = 500;

const NAME_RE = /^[a-z0-9][a-z0-9_]{1,39}$/;

/**
 * Normalize a user-typed type name to canonical form: lowercase,
 * trimmed, internal whitespace/underscore runs collapsed to a single
 * underscore ("Street Lights" -> "street_lights"). Returns null when
 * the result isn't a valid name (2-40 chars of [a-z0-9_], starting
 * alphanumeric) — callers surface that as a validation error.
 */
export function normalizeCrewTypeName(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return NAME_RE.test(normalized) ? normalized : null;
}

export function isBuiltInCrewType(name: string): boolean {
  return (BUILT_IN_CREW_TYPES as readonly string[]).includes(name);
}

/** Whitespace-separated word count — the >=10-word description gate. */
export function descriptionWordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Display form: underscores read as spaces ("line_crew" -> "line crew"). */
export function crewTypeLabel(name: string): string {
  return name.replace(/_/g, " ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/crew-types.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crew-types.ts src/lib/crew-types.test.ts
git commit -m "feat(crews): shared crew-type module — built-ins, normalization, description gate"
```

---

### Task 2: Migration 031 — `city_crew_types` table + RLS

New table following the exact idiom of migrations 024/030: city-scoped, idempotent DDL, staff-scoped RLS, comments. The ≥10-word rule is enforced app-side (zod); the DB CHECK only guards non-empty (word-splitting in SQL is brittle and the app is the only writer).

**Files:**
- Create: `supabase/migrations/20260708_031_city_crew_types.sql`
- Modify: the RLS test harness (locate via `pnpm test:rls` script — `scripts/test-rls.mjs`; mirror its existing `crews` coverage block)

- [ ] **Step 1: Write the migration**

```sql
-- 031: city_crew_types — per-city CUSTOM crew labor types, additive to the
-- 7 built-ins hardcoded in src/lib/crew-types.ts (paving, line_crew,
-- sign_crew, cleanup, concrete, arborist, drain_crew — those never get rows
-- here; the app rejects reserved names).
--
-- description is the AI-routing signal: >=10 words describing what the crew
-- does, injected into the work-order generator prompt so Gemini can route
-- matching work orders to this type (crews.crew_type and
-- work_orders.crew_type are already free text — no change needed there).
-- The word-count rule is enforced app-side (zod, both client and server);
-- the CHECK below only guards non-empty.

CREATE TABLE IF NOT EXISTS city_crew_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Canonical snake_case name (see normalizeCrewTypeName): 2-40 chars.
  name        text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9_]{1,39}$'),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, name)
);

CREATE INDEX IF NOT EXISTS idx_city_crew_types_city ON city_crew_types (city_id);

-- RLS — same posture as crews (030): staff-only read scoped to own city
-- (descriptions are internal operational config), staff write as defense in
-- depth (the admin-gated server action runs service-role and bypasses RLS).

ALTER TABLE city_crew_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS city_crew_types_select_staff ON city_crew_types;
CREATE POLICY city_crew_types_select_staff ON city_crew_types
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS city_crew_types_write_staff ON city_crew_types;
CREATE POLICY city_crew_types_write_staff ON city_crew_types
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON city_crew_types TO authenticated;
GRANT INSERT, UPDATE, DELETE ON city_crew_types TO authenticated;

COMMENT ON TABLE city_crew_types IS 'Per-city custom crew labor types, additive to the built-in 7. 031.';
COMMENT ON COLUMN city_crew_types.description IS 'What this crew does (>=10 words, app-enforced) — injected into the AI work-order prompt for routing.';
```

- [ ] **Step 2: Apply the migration**

Do NOT run `pnpm db:migrate` (naive `supabase db push` — the remote migration ledger is unrecorded; see docs/runbooks). Apply the same way 024–030 were applied:

1. Read `scripts/run-migrations.mjs` (documented applier in the 024 header) to confirm invocation.
2. If it applies pending files in filesystem order: run `node scripts/run-migrations.mjs` from `-Social-Impact-/`.
3. If that script is absent/stale, apply via the Supabase Management API `POST /v1/projects/{ref}/database/query` using the PAT in `.env.local` (established procedure for this project — the executor should read `.env.local` for the token/ref var names, not guess).

Expected: statement runs clean; re-running is a no-op (idempotent DDL).

- [ ] **Step 3: Add RLS regression coverage**

Open `scripts/test-rls.mjs`, find the block covering `crews` (added with migration 030), and add an equivalent block for `city_crew_types` asserting: (a) staff of city A can SELECT city A rows, (b) staff of city A cannot SELECT city B rows, (c) anon gets zero rows. Mirror the existing block's structure exactly — same helpers, same assertion style.

- [ ] **Step 4: Run RLS tests**

Run: `pnpm test:rls`
Expected: PASS including the new `city_crew_types` assertions.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260708_031_city_crew_types.sql scripts/test-rls.mjs
git commit -m "feat(crews): city_crew_types table (031) — custom types with AI-routing descriptions"
```

---

### Task 3: `fetchCityCrewTypes` DB accessor

**Files:**
- Create: `src/lib/db/crew-types.ts`

- [ ] **Step 1: Write the implementation**

Contract copied from `resolveTeamKeyForCategory` / `fetchCrewIdsByUser`: never throws, degrades to `[]` on any failure (including un-migrated DB where PostgREST errors on the missing table), so the pipeline and pages keep working.

```ts
// src/lib/db/crew-types.ts
import "server-only";
import { createServerClient } from "@/lib/db/client";
import type { CityCrewType } from "@/lib/crew-types";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-crew-types");

/**
 * All custom crew types of `cityId`, name-ordered. Best-effort: any failure
 * (including an un-migrated DB missing the 031 table) logs and returns [] —
 * callers then behave exactly as before custom types existed.
 */
export async function fetchCityCrewTypes(
  cityId: string,
): Promise<CityCrewType[]> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("city_crew_types")
      .select("name, description")
      .eq("city_id", cityId)
      .order("name");
    if (error) {
      log.warn("city_crew_types query failed (degrading to none)", {
        cityId,
        error: error.message,
      });
      return [];
    }
    return (data ?? []) as CityCrewType[];
  } catch (err) {
    log.error("fetchCityCrewTypes threw", err, { cityId });
    return [];
  }
}
```

Note: if `createLogger`'s instance has no `.warn`, use `.error` with `undefined` err arg — match `lib/db/crews.ts` usage.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/crew-types.ts
git commit -m "feat(crews): fetchCityCrewTypes accessor — best-effort, [] on un-migrated DB"
```

---

### Task 4: Server actions — `createCrewType`, relaxed `crewTypeSchema`, `inviteMember` returns userId

**Files:**
- Modify: `src/app/city/[slug]/members/crew-actions.ts`
- Modify: `src/app/city/[slug]/members/actions.ts`

- [ ] **Step 1: Rework `crew-actions.ts`**

(a) Delete the local `CREW_TYPE_VALUES` array (lines 17–27) and import from the shared module:

```ts
import {
  descriptionWordCount,
  isBuiltInCrewType,
  MAX_TYPE_DESCRIPTION_CHARS,
  MIN_TYPE_DESCRIPTION_WORDS,
  normalizeCrewTypeName,
} from "@/lib/crew-types";
```

(b) Replace the enum `crewTypeSchema` (line 30) with validated free text — shape only; existence is checked against the DB in the actions:

```ts
// Free text, but canonical: 2-40 chars of [a-z0-9_]. Existence (built-in or
// this city's city_crew_types row) is verified in the action, not the schema.
const crewTypeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_]{1,39}$/)
  .nullable();
```

(c) Add a helper that verifies a submitted type exists for this city, and call it inside BOTH `createCrew` and `updateCrew` right after the `getCityAdminContext` gate (before the insert/update):

```ts
/** A crew's type must be a built-in or one of this city's custom types —
 *  rejects forged values that would silently break dispatch auto-suggest. */
async function crewTypeExists(
  db: ReturnType<typeof createServerClient>,
  cityId: string,
  crewType: string,
): Promise<boolean> {
  if (isBuiltInCrewType(crewType)) return true;
  const { data, error } = await db
    .from("city_crew_types")
    .select("name")
    .eq("city_id", cityId)
    .eq("name", crewType)
    .maybeSingle();
  if (error) {
    log.error("crew type lookup failed", error, { cityId, crewType });
    return false;
  }
  return data !== null;
}
```

In `createCrew` and `updateCrew`, after the ctx gate:

```ts
if (crewType && !(await crewTypeExists(db, ctx.cityId, crewType)))
  return { ok: false, error: "unknown_crew_type" };
```

(`createCrew` constructs `db` after the gate already; `updateCrew` likewise — insert the check after `const db = createServerClient();`.)

(d) Add the `createCrewType` action at the end of the file:

```ts
export type CrewTypeCreateResult =
  | { ok: true; name: string; description: string }
  | { ok: false; error: string };

const createTypeSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().trim().max(MAX_TYPE_DESCRIPTION_CHARS),
});

/**
 * Create a custom crew type for the admin's city. The description is
 * mandatory and must run >=10 words — it is the signal the AI work-order
 * generator uses to route work to this type, so a bare label is useless.
 * Admin-gated.
 */
export async function createCrewType(input: {
  slug: string;
  name: string;
  description: string;
}): Promise<CrewTypeCreateResult> {
  const parsed = createTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { slug, description } = parsed.data;

  const name = normalizeCrewTypeName(parsed.data.name);
  if (!name) return { ok: false, error: "invalid_type_name" };
  if (isBuiltInCrewType(name)) return { ok: false, error: "crew_type_reserved" };
  if (descriptionWordCount(description) < MIN_TYPE_DESCRIPTION_WORDS)
    return { ok: false, error: "type_description_too_short" };

  const ctx = await getCityAdminContext(slug);
  if (!ctx) return { ok: false, error: "not_authorized" };

  const db = createServerClient();
  const { error } = await db
    .from("city_crew_types")
    .insert({ city_id: ctx.cityId, name, description });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "crew_type_taken" };
    log.error("crew type insert failed", error, { slug, name });
    return { ok: false, error: "crew_type_create_failed" };
  }

  revalidatePath(`/city/${slug}/members`);
  return { ok: true, name, description };
}
```

- [ ] **Step 2: `inviteMember` returns the new userId**

In `src/app/city/[slug]/members/actions.ts`:

```ts
export type InviteMemberResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };
```

Change `inviteMember`'s return type from `Promise<MemberActionResult>` to `Promise<InviteMemberResult>`, and its two success/exit points: the final `return { ok: true };` becomes `return { ok: true, userId };`; the crew-sync-failure branch keeps returning the error shape (unchanged). `updateMember` keeps `MemberActionResult`. The existing caller (`invite-member-modal.tsx`) only reads `res.ok` — no change required there.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (Note: `crews-panel.tsx` still imports nothing new yet; its local `CREW_TYPE_OPTIONS` array is removed in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/app/city/[slug]/members/crew-actions.ts src/app/city/[slug]/members/actions.ts
git commit -m "feat(crews): createCrewType action, free-text crew_type validation, inviteMember returns userId"
```

---

### Task 5: `MenuSelect` — the staff-console popover listbox

The one component both "make dropdowns nicer/consistent" and "+ New type…" hang off. Design constraints:

- **Trigger** looks exactly like the other modal controls: reuse `CONTROL_CLASS` metrics (h-9, hairline border, overlay bg, ring-accent focus) + a right chevron.
- **Menu portals to `document.body`** — the crew dialog's body is `overflow-y-auto`, which would clip an in-flow absolute menu. Fixed-position via `getBoundingClientRect`, flips above the trigger when there's <260px below, repositions on scroll/resize (capture phase), max-height 240px with the app's `custom-scrollbar`.
- **Focus never leaves the trigger** (`aria-activedescendant` listbox pattern). This is deliberate: the menu lives OUTSIDE the dialog DOM, and `MemberModalShell`'s focus trap only queries inside the dialog — moving real focus into the portal would fight the trap. Keyboard: ArrowDown/ArrowUp/Home/End move the active option, Enter/Space select, Escape closes (and stops propagation so the modal doesn't also close), printable chars typeahead (500ms buffer). Menu closes on outside `pointerdown`, selection, or Tab.
- Options support optional `swatch` (division color dot) and `hint` (faint right-aligned note). Selected option shows a check.
- Grayscale register only: `bg-surface`, `border-hairline`, hover/active `bg-overlay-strong`, `shadow-[var(--shadow-pop)]`, radius `var(--radius-md)`. Entry animation reuses the existing `city-pop` keyframe with `motion-reduce:animate-none`.

**Files:**
- Create: `src/components/ui/menu-select.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ui/menu-select.tsx
"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   MenuSelect — the staff-console dropdown.

   A button-trigger + portal listbox replacing native <select> in the
   admin modals (Role, Team, Division, Crew type). Native selects
   can't style their popup or host an inline "add new" row; this one
   does both while keeping the listbox keyboard contract.

   Focus stays on the trigger (aria-activedescendant pattern): the
   menu portals to <body>, outside MemberModalShell's focus trap, so
   moving real focus into it would fight the trap.
   ================================================================== */

export interface MenuSelectOption {
  value: string;
  label: string;
  /** Faint right-aligned annotation (e.g. a crew type's description cue). */
  hint?: string;
  /** Small color dot before the label (e.g. division color). */
  swatch?: string;
}

export interface MenuSelectProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: MenuSelectOption[];
  /** Label for the null choice. When set, it renders as the first option. */
  placeholder?: string;
  disabled?: boolean;
  /** Footer action row (e.g. "+ New type…"). Closes the menu, then fires. */
  action?: { label: string; onSelect: () => void };
  className?: string;
}

const MENU_MAX_H = 240;
const GAP = 4;

export function MenuSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  action,
  className,
}: MenuSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    up: boolean;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });
  const listboxId = useId();

  // The rendered rows: optional null row first, then options, then action.
  const rows: Array<
    | { kind: "option"; value: string | null; label: string; hint?: string; swatch?: string }
    | { kind: "action"; label: string }
  > = [
    ...(placeholder !== undefined
      ? [{ kind: "option" as const, value: null, label: placeholder }]
      : []),
    ...options.map((o) => ({ kind: "option" as const, ...o })),
    ...(action ? [{ kind: "action" as const, label: action.label }] : []),
  ];

  const selectedIndex = rows.findIndex(
    (r) => r.kind === "option" && r.value === value,
  );
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : null;
  const triggerLabel =
    selected && selected.kind === "option" ? selected.label : (placeholder ?? "Select…");

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < MENU_MAX_H + GAP + 8;
    setPos({
      top: up ? r.top - GAP : r.bottom + GAP,
      left: r.left,
      width: r.width,
      up,
    });
  }, []);

  function openMenu() {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    position();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setPos(null);
  }

  function commit(index: number) {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "action") {
      close();
      action?.onSelect();
      return;
    }
    onChange(row.value);
    close();
  }

  // Reposition while open on scroll/resize anywhere (capture: the modal body
  // scrolls, not the window).
  useLayoutEffect(() => {
    if (!open) return;
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open, position]);

  // Outside pointerdown closes. The trigger's own pointerdown toggles instead.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t))
        return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active row visible while arrowing.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function moveActive(delta: number) {
    setActive((cur) => {
      const next = Math.min(Math.max(cur + delta, 0), rows.length - 1);
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(rows.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        // Stop the modal's own escape-to-close from also firing.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
      default: {
        if (e.key.length !== 1) return;
        const now = Date.now();
        const t = typeahead.current;
        t.buffer = now - t.at > 500 ? e.key : t.buffer + e.key;
        t.at = now;
        const q = t.buffer.toLowerCase();
        const hit = rows.findIndex(
          (r) => r.kind === "option" && r.label.toLowerCase().startsWith(q),
        );
        if (hit >= 0) setActive(hit);
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${active}` : undefined}
        onPointerDown={(e) => {
          e.preventDefault(); // keep focus on the trigger
          if (open) close();
          else openMenu();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-left text-[13px] text-foreground outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 truncate",
            value === null && placeholder !== undefined && "text-subtle",
          )}
        >
          {selected?.kind === "option" && selected.swatch && (
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selected.swatch }}
              aria-hidden
            />
          )}
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-faint transition-transform duration-150",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              ...(pos.up
                ? { bottom: window.innerHeight - pos.top }
                : { top: pos.top }),
            }}
            className={cn(
              "z-[60] overflow-y-auto custom-scrollbar rounded-[var(--radius-md)] border border-hairline bg-surface p-1 shadow-[var(--shadow-pop)]",
              "animate-[city-pop_120ms_ease-out] motion-reduce:animate-none",
            )}
          >
            <div style={{ maxHeight: MENU_MAX_H }}>
              {rows.map((row, i) => {
                if (row.kind === "action") {
                  return (
                    <div key="__action" role="presentation">
                      <div className="mx-1 my-1 border-t border-hairline" />
                      <div
                        id={`${listboxId}-${i}`}
                        role="option"
                        aria-selected={false}
                        data-index={i}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => commit(i)}
                        onMouseMove={() => setActive(i)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-[13px] text-subtle",
                          active === i && "bg-overlay-strong text-foreground",
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        {row.label}
                      </div>
                    </div>
                  );
                }
                const isSelected =
                  row.value === value ||
                  (row.value === null && value === null && placeholder !== undefined && i === 0);
                return (
                  <div
                    key={row.value ?? "__null"}
                    id={`${listboxId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    data-index={i}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => commit(i)}
                    onMouseMove={() => setActive(i)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-[calc(var(--radius-md)-2px)] px-2 py-1.5 text-[13px] text-foreground",
                      active === i && "bg-overlay-strong",
                    )}
                  >
                    {row.swatch && (
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: row.swatch }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    {row.hint && (
                      <span className="max-w-[45%] flex-shrink-0 truncate text-[11px] text-faint">
                        {row.hint}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className="h-3.5 w-3.5 flex-shrink-0 text-foreground"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
```

Implementation notes for the executor:
- Verify the `city-pop` keyframe exists globally (it's used by `member-modal.tsx:355`); if it's scoped elsewhere, swap for a 120ms opacity/scale transition.
- Verify `--shadow-pop`, `bg-overlay-strong`, `text-subtle`, `text-faint`, `border-hairline` tokens exist (all used in `member-modal.tsx` / `crews-panel.tsx` today).
- z-index: the modal overlay is `z-50`; the menu must sit above it (`z-[60]`).
- The `maxHeight` wrapper div is inside the scroll container so the border/padding don't clip; if scrolling misbehaves, move `maxHeight: MENU_MAX_H` onto the outer menu div's style and drop the wrapper.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/menu-select.tsx
git commit -m "feat(ui): MenuSelect — portal popover listbox for staff console dropdowns"
```

---

### Task 6: Swap `RoleSelect` / `TeamSelect` onto MenuSelect

**Files:**
- Modify: `src/components/members/member-modal.tsx`

- [ ] **Step 1: Re-implement the two selects**

Keep both components' names, props, and label markup EXACTLY as they are (callers in `invite-member-modal.tsx` and the edit-member modal don't change). Replace only the inner `<select>` with `MenuSelect`. Import `TEAMS`/`isValidTeamId` if needed for swatches; `TEAM_OPTIONS` entries in `lib/teams.ts` already carry `color`.

```tsx
import { MenuSelect } from "@/components/ui/menu-select";

export function RoleSelect({ id, value, onChange, disabled }: { /* unchanged */ }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>Role</label>
      <MenuSelect
        id={id}
        value={value}
        // Role options are exactly the MemberRole union, so the cast is total.
        onChange={(v) => onChange(v as MemberRole)}
        options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        disabled={disabled}
      />
    </div>
  );
}

export function TeamSelect({ id, value, onChange, required }: { /* unchanged */ }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        Team{required && <span className="text-faint"> *</span>}
      </label>
      <MenuSelect
        id={id}
        value={value}
        onChange={onChange}
        placeholder="No team"
        options={TEAM_OPTIONS.map((t) => ({
          value: t.id,
          label: t.shortLabel,
          swatch: t.color,
        }))}
      />
    </div>
  );
}
```

Note: `<label htmlFor>` pointing at a `<button>` works for click-to-focus; keep ids wired.

Also extend `ERROR_COPY` with the new server codes:

```ts
  unknown_crew_type: "That crew type no longer exists — pick another or create it again.",
  invalid_type_name: "Type names are 2-40 characters: letters, numbers, spaces.",
  crew_type_reserved: "That's a built-in type — pick it from the list instead.",
  type_description_too_short: "Describe what this crew does in at least 10 words.",
  crew_type_taken: "This city already has a crew type with that name.",
  crew_type_create_failed: "Couldn't create the crew type. Please try again.",
  invite_failed: "Couldn't send the invite. Please try again.",
  member_row_failed: "The invite was sent but the profile failed — try again.",
```

- [ ] **Step 2: Verify in browser**

Run dev server; open Invite member dialog on `/city/<slug>/members`; confirm Role/Team dropdowns open styled menus, keyboard-navigate, and don't clip inside the modal.

- [ ] **Step 3: Commit**

```bash
git add src/components/members/member-modal.tsx
git commit -m "feat(members): RoleSelect/TeamSelect on MenuSelect + new error copy"
```

---

### Task 7: Crew dialog — MenuSelect everywhere, "+ New type…" flow, custom types plumbed from the page

**Files:**
- Modify: `src/components/crews/crews-panel.tsx`
- Modify: `src/app/city/[slug]/members/page.tsx`

- [ ] **Step 1: Plumb custom types from the server page**

In `page.tsx`, next to the existing `fetchCityCrews` call, fetch custom types and pass them down (the page already resolves `cityId` for crews):

```ts
import { fetchCityCrewTypes } from "@/lib/db/crew-types";
// ...
const crewTypes = await fetchCityCrewTypes(cityId);
// pass crewTypes={crewTypes} to <CrewsPanel …>
```

Executor: read the page first; mirror however `crews` currently flows into `CrewsPanel`, including any demo-session gating around it.

- [ ] **Step 2: Rework `crews-panel.tsx`**

(a) Imports: drop the local `CREW_TYPE_OPTIONS` array (lines 43–53) and the local `typeLabel` (line 57); import instead:

```ts
import {
  BUILT_IN_CREW_TYPES,
  type CityCrewType,
  crewTypeLabel,
  descriptionWordCount,
  MIN_TYPE_DESCRIPTION_WORDS,
} from "@/lib/crew-types";
import { MenuSelect } from "@/components/ui/menu-select";
import { createCrewType } from "@/app/city/[slug]/members/crew-actions";
```

Replace remaining `typeLabel(` call sites with `crewTypeLabel(`.

(b) `CrewsPanel` and `CrewDialog` props gain `crewTypes: CityCrewType[]` (panel passes it through to the dialog).

(c) **Division select** (create mode, lines 409–424) becomes:

```tsx
<div className="flex flex-col gap-1.5">
  <label htmlFor={teamId} className={FIELD_LABEL_CLASS}>Division</label>
  <MenuSelect
    id={teamId}
    value={teamKey}
    onChange={(v) => v !== null && handleTeamChange(v)}
    options={TEAM_OPTIONS.map((t) => ({
      value: t.id,
      label: t.shortLabel,
      swatch: t.color,
    }))}
  />
</div>
```

(No `placeholder` — division is always set; a null onChange value can't occur without one.)

(d) **Crew type select** (lines 428–445): the dialog keeps `crewType` state plus new state for the creation sub-form and locally-added types:

```tsx
const [localTypes, setLocalTypes] = useState<CityCrewType[]>([]);
const [typeFormOpen, setTypeFormOpen] = useState(false);
const [newTypeName, setNewTypeName] = useState("");
const [newTypeDesc, setNewTypeDesc] = useState("");
const [typeError, setTypeError] = useState<string | null>(null);
const [typePending, startTypeTransition] = useTransition();
```

Options = built-ins ∪ server customs ∪ session-created customs ∪ (current value if unknown — e.g. its row was deleted after the crew was typed):

```tsx
const typeOptions = useMemo(() => {
  const seen = new Set<string>();
  const opts: { value: string; label: string; hint?: string }[] = [];
  for (const t of BUILT_IN_CREW_TYPES) {
    seen.add(t);
    opts.push({ value: t, label: crewTypeLabel(t) });
  }
  for (const t of [...crewTypes, ...localTypes]) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    opts.push({ value: t.name, label: crewTypeLabel(t.name), hint: t.description });
  }
  if (crewType && !seen.has(crewType))
    opts.push({ value: crewType, label: crewTypeLabel(crewType) });
  return opts;
}, [crewTypes, localTypes, crewType]);
```

The field:

```tsx
<div className="flex flex-col gap-1.5">
  <label htmlFor={typeId} className={FIELD_LABEL_CLASS}>Crew type</label>
  <MenuSelect
    id={typeId}
    value={crewType}
    onChange={setCrewType}
    placeholder="No type"
    options={typeOptions}
    action={{ label: "New type…", onSelect: () => setTypeFormOpen(true) }}
  />
</div>
```

(e) **New-type sub-form**, rendered directly under the crew-type field when `typeFormOpen`. Words-remaining counter drives the disabled state; server re-validates:

```tsx
{typeFormOpen && (
  <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-3">
    <p className="text-[12px] font-medium text-subtle">New crew type</p>
    {typeError && <FormError message={typeError} />}
    <input
      type="text"
      value={newTypeName}
      onChange={(e) => setNewTypeName(e.target.value)}
      placeholder="e.g. street lights"
      autoComplete="off"
      className={CONTROL_CLASS}
      aria-label="Type name"
    />
    <textarea
      value={newTypeDesc}
      onChange={(e) => setNewTypeDesc(e.target.value)}
      placeholder="What does this crew do? The AI uses this to route matching work orders here."
      rows={3}
      className={cn(CONTROL_CLASS, "h-auto min-h-[72px] resize-y py-2")}
      aria-label="What this crew does"
    />
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] tabular-nums text-faint">
        {(() => {
          const words = descriptionWordCount(newTypeDesc);
          return words >= MIN_TYPE_DESCRIPTION_WORDS
            ? `${words} words`
            : `${MIN_TYPE_DESCRIPTION_WORDS - words} more word${MIN_TYPE_DESCRIPTION_WORDS - words === 1 ? "" : "s"} needed`;
        })()}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setTypeFormOpen(false);
            setTypeError(null);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isPending={typePending}
          disabled={
            typePending ||
            newTypeName.trim().length < 2 ||
            descriptionWordCount(newTypeDesc) < MIN_TYPE_DESCRIPTION_WORDS
          }
          onClick={() => {
            setTypeError(null);
            startTypeTransition(async () => {
              const res = await createCrewType({
                slug,
                name: newTypeName,
                description: newTypeDesc.trim(),
              });
              if (!res.ok) {
                setTypeError(humanizeMemberError(res.error));
                return;
              }
              setLocalTypes((prev) => [
                ...prev,
                { name: res.name, description: res.description },
              ]);
              setCrewType(res.name);
              setTypeFormOpen(false);
              setNewTypeName("");
              setNewTypeDesc("");
            });
          }}
        >
          Add type
        </Button>
      </div>
    </div>
  </div>
)}
```

(Import `cn` from `@/lib/utils/cn`; `CONTROL_CLASS` is height-locked at h-9, hence the `h-auto` override for the textarea.)

Note the sub-form uses `type="button"` everywhere — it must never submit the surrounding crew form.

- [ ] **Step 3: Typecheck + browser check**

`pnpm typecheck`, then in the browser: create a custom type ("street lights", a 12-word description), watch the counter flip, confirm it lands selected and appears in the menu with its description hint; create the crew; reopen dialog — type persists (served from the DB this time).

- [ ] **Step 4: Commit**

```bash
git add src/components/crews/crews-panel.tsx "src/app/city/[slug]/members/page.tsx"
git commit -m "feat(crews): MenuSelect dropdowns + inline custom crew type creation with 10-word AI description"
```

---

### Task 8: Invite-by-email inside the crew dialog roster

**Files:**
- Modify: `src/components/crews/crews-panel.tsx`

- [ ] **Step 1: Add the invite flow to `CrewDialog`**

State + imports:

```tsx
import { inviteMember } from "@/app/city/[slug]/members/actions";
// ...
const [inviteOpen, setInviteOpen] = useState(false);
const [inviteEmail, setInviteEmail] = useState("");
const [inviteName, setInviteName] = useState("");
const [inviteError, setInviteError] = useState<string | null>(null);
const [invitePending, startInviteTransition] = useTransition();
// People invited from this dialog — appended to the candidate list so they
// can sit on the roster before the page refetches.
const [invited, setInvited] = useState<CrewCandidate[]>([]);
```

Candidates union (replaces the existing `candidates` memo):

```tsx
const candidates = useMemo(() => {
  const base = members.filter((m) => m.teamKey === teamKey);
  const known = new Set(base.map((m) => m.id));
  return [...base, ...invited.filter((m) => m.teamKey === teamKey && !known.has(m.id))];
}, [members, invited, teamKey]);
```

Invite handler:

```tsx
function handleInvite() {
  setInviteError(null);
  const email = inviteEmail.trim();
  const displayName = inviteName.trim();
  if (!email || !displayName) {
    setInviteError("Add an email and a name.");
    return;
  }
  startInviteTransition(async () => {
    const res = await inviteMember({
      slug,
      email,
      displayName,
      role: "staff_dispatcher", // crew members get console access for their division
      teamKey,                  // the crew's division
      phone: null,
      crewIds: [],              // roster membership lands on crew submit via setCrewMembers
    });
    if (!res.ok) {
      setInviteError(humanizeMemberError(res.error));
      return;
    }
    setInvited((prev) => [
      ...prev,
      { id: res.userId, displayName, teamKey, role: "staff_dispatcher" },
    ]);
    setRoster((prev) => [...prev, res.userId]); // pre-check them onto the roster
    setInviteEmail("");
    setInviteName("");
    setInviteOpen(false);
  });
}
```

UI — after the candidates list (or the "no members" empty state) inside the Members fieldset:

```tsx
{!inviteOpen ? (
  <button
    type="button"
    onClick={() => setInviteOpen(true)}
    className="flex w-fit items-center gap-1.5 text-[12px] font-medium text-subtle outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 rounded-[var(--radius-md)] px-1 py-0.5"
  >
    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
    Invite by email
  </button>
) : (
  <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-hairline bg-overlay p-3">
    <p className="text-[12px] font-medium text-subtle">
      Invite to {teamShortLabel(teamKey)} &amp; this crew
    </p>
    {inviteError && <FormError message={inviteError} />}
    <input
      type="email"
      value={inviteEmail}
      onChange={(e) => setInviteEmail(e.target.value)}
      placeholder="name@city.gov"
      autoComplete="off"
      inputMode="email"
      className={CONTROL_CLASS}
      aria-label="Email"
    />
    <input
      type="text"
      value={inviteName}
      onChange={(e) => setInviteName(e.target.value)}
      placeholder="Full name"
      autoComplete="off"
      className={CONTROL_CLASS}
      aria-label="Name"
    />
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-faint">
        They get an email invite &amp; dispatcher access
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm"
          onClick={() => { setInviteOpen(false); setInviteError(null); }}>
          Cancel
        </Button>
        <Button type="button" variant="outline" size="sm"
          isPending={invitePending}
          disabled={invitePending || !inviteEmail.trim() || !inviteName.trim()}
          onClick={handleInvite}>
          Send invite
        </Button>
      </div>
    </div>
  </div>
)}
```

Behavioral notes:
- The invite fires immediately (real email, real pending member) — the crew's roster membership only lands when the crew form is submitted (`setCrewMembers`). If the admin cancels the crew dialog afterward, the person remains an invited member of the division without a crew: accepted trade-off, decided during design.
- `roleRequiresTeam("staff_dispatcher")` is satisfied because `teamKey` is always a real division in this dialog.
- In edit mode the division is fixed; in create mode, `handleTeamChange` already clears `roster` — invited people from another division disappear from candidates (correct: they were invited into the OLD division; note this stays visible in the members table).

- [ ] **Step 2: Browser check**

Invite a throwaway email from the crew dialog: confirm inline success (row appears checked in the roster), submit the crew, reopen — the invitee is on the crew; the members table shows the pending member.

- [ ] **Step 3: Commit**

```bash
git add src/components/crews/crews-panel.tsx
git commit -m "feat(crews): invite crew members by email from the crew dialog (dispatcher, crew's division)"
```

---

### Task 9: AI schema + prompt builders (zero-custom ⇒ byte-identical)

**Files:**
- Modify: `src/lib/ai/work-order-schema.ts`
- Create: `src/lib/ai/work-order-schema.test.ts`
- Modify: `src/lib/ai/prompt.ts`
- Create: `src/lib/ai/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/ai/work-order-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  buildAiWorkOrderSchema,
  buildGeminiWorkOrderSchema,
  GEMINI_WORK_ORDER_SCHEMA,
} from "./work-order-schema";

const VALID_WO = {
  department: "public_works",
  crew_type: "paving",
  est_minutes: 30,
  materials: [{ item: "cold patch", qty: 1 }],
  est_cost: 100,
  rationale: "standard patch",
};

describe("buildGeminiWorkOrderSchema", () => {
  it("with no custom types equals the static schema exactly", () => {
    expect(buildGeminiWorkOrderSchema([])).toEqual(GEMINI_WORK_ORDER_SCHEMA);
  });
  it("appends custom type names to the crew_type enum", () => {
    const s = buildGeminiWorkOrderSchema(["street_lights"]);
    // biome-ignore lint/suspicious/noExplicitAny: test peeks at SDK schema shape
    const enumVals = (s.properties as any).crew_type.enum as string[];
    expect(enumVals).toContain("street_lights");
    expect(enumVals).toContain("paving");
  });
  it("dedupes a custom name that collides with a built-in", () => {
    const s = buildGeminiWorkOrderSchema(["paving"]);
    // biome-ignore lint/suspicious/noExplicitAny: test peeks at SDK schema shape
    const enumVals = (s.properties as any).crew_type.enum as string[];
    expect(enumVals.filter((v) => v === "paving")).toHaveLength(1);
  });
});

describe("buildAiWorkOrderSchema", () => {
  it("accepts built-ins and null with no customs", () => {
    const schema = buildAiWorkOrderSchema([]);
    expect(schema.safeParse(VALID_WO).success).toBe(true);
    expect(schema.safeParse({ ...VALID_WO, crew_type: null }).success).toBe(true);
  });
  it("rejects an unknown type with no customs", () => {
    const schema = buildAiWorkOrderSchema([]);
    expect(schema.safeParse({ ...VALID_WO, crew_type: "street_lights" }).success).toBe(false);
  });
  it("accepts a registered custom type", () => {
    const schema = buildAiWorkOrderSchema(["street_lights"]);
    expect(schema.safeParse({ ...VALID_WO, crew_type: "street_lights" }).success).toBe(true);
  });
});
```

```ts
// src/lib/ai/prompt.test.ts
import { describe, expect, it } from "vitest";
import { buildWorkOrderPrompt, WORK_ORDER_PROMPT } from "./prompt";

describe("buildWorkOrderPrompt", () => {
  it("with no custom types returns the base prompt unchanged", () => {
    expect(buildWorkOrderPrompt([])).toBe(WORK_ORDER_PROMPT);
  });
  it("injects each custom type with its description before ## DEPARTMENT", () => {
    const out = buildWorkOrderPrompt([
      {
        name: "street_lights",
        description:
          "maintains and repairs street light fixtures poles and wiring across the city",
      },
    ]);
    expect(out).toContain("## CITY-SPECIFIC CREW TYPES");
    expect(out).toContain("street_lights");
    expect(out).toContain("maintains and repairs street light fixtures");
    expect(out.indexOf("## CITY-SPECIFIC CREW TYPES")).toBeLessThan(
      out.indexOf("## DEPARTMENT"),
    );
    // Base sections all survive.
    expect(out).toContain("## CREW TYPE");
    expect(out).toContain("## OUTPUT");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/ai/work-order-schema.test.ts src/lib/ai/prompt.test.ts`
Expected: FAIL — builders not exported.

- [ ] **Step 3: Implement the builders**

In `work-order-schema.ts`: replace the local `CREW_TYPES` const (lines 13–21) with an import from the shared module, and add builders AFTER the existing exports (keep `aiWorkOrderSchema` and `GEMINI_WORK_ORDER_SCHEMA` exported and unchanged in shape — other code/tests may reference them):

```ts
import { BUILT_IN_CREW_TYPES } from "@/lib/crew-types";

const CREW_TYPES = BUILT_IN_CREW_TYPES; // keep local alias; shape unchanged
```

```ts
/** Built-ins ∪ custom names, deduped, order-stable (built-ins first). */
function allCrewTypes(customNames: string[]): string[] {
  return [...new Set([...CREW_TYPES, ...customNames])];
}

/**
 * Zod validator for a work order whose crew_type may be one of this city's
 * custom types. With no custom names this accepts exactly what
 * aiWorkOrderSchema accepts.
 */
export function buildAiWorkOrderSchema(customNames: string[]) {
  const allowed = new Set(allCrewTypes(customNames));
  return aiWorkOrderSchema.extend({
    crew_type: z
      .string()
      .refine((v) => allowed.has(v), "unknown crew_type")
      .nullable(),
  });
}

/**
 * Gemini structured-output schema with the crew_type enum widened to this
 * city's custom types. With no custom names this deep-equals
 * GEMINI_WORK_ORDER_SCHEMA — the zero-drift guarantee for existing cities.
 */
export function buildGeminiWorkOrderSchema(customNames: string[]): ObjectSchema {
  return {
    ...GEMINI_WORK_ORDER_SCHEMA,
    properties: {
      ...GEMINI_WORK_ORDER_SCHEMA.properties,
      crew_type: {
        type: SchemaType.STRING,
        format: "enum",
        enum: allCrewTypes(customNames),
        nullable: true,
      },
    },
  };
}
```

`aiWorkOrderSchema.extend` requires the base to be a plain `z.object` — it is. If the zod v4 `.extend` signature complains, rebuild via `aiWorkOrderSchema.omit({ crew_type: true }).extend({...})` — semantics identical.

In `prompt.ts`, add after `WORK_ORDER_PROMPT`:

```ts
import type { CityCrewType } from "@/lib/crew-types";

/**
 * Work-order prompt with this city's custom crew types injected (name +
 * admin-written description — the routing signal). Zero custom types returns
 * WORK_ORDER_PROMPT unchanged, so existing cities see an identical prompt.
 */
export function buildWorkOrderPrompt(customTypes: CityCrewType[]): string {
  if (customTypes.length === 0) return WORK_ORDER_PROMPT;
  const section = [
    `## CITY-SPECIFIC CREW TYPES`,
    `This city also operates the following custom crews. Prefer one of these over the`,
    `generic list above when its description matches the repair better:`,
    ...customTypes.map((t) => `- ${t.name}: ${t.description}`),
    ``,
    ``,
  ].join("\n");
  return WORK_ORDER_PROMPT.replace("## DEPARTMENT", `${section}## DEPARTMENT`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/ai/work-order-schema.test.ts src/lib/ai/prompt.test.ts`
Expected: PASS. Also run `pnpm vitest run src/lib/ai` — pre-existing AI tests must stay green (the static exports are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/work-order-schema.ts src/lib/ai/work-order-schema.test.ts src/lib/ai/prompt.ts src/lib/ai/prompt.test.ts
git commit -m "feat(ai): per-city crew-type schema + prompt builders (zero-custom = byte-identical)"
```

---

### Task 10: Wire the pipeline — `generateWorkOrderAI(classification, customTypes)`

**Files:**
- Modify: `src/lib/ai/work-order-ai.ts`
- Modify: `src/lib/ai/classify-pipeline.ts`
- Modify: `src/lib/types.ts` (verify first)
- Possibly modify: `src/lib/ai/work-order-ai.test.ts`, `src/lib/ai/classify-pipeline.test.ts` (mock signatures)

- [ ] **Step 1: Widen types**

In `src/lib/types.ts`: find `CrewType` and `WorkOrder`. Keep `CrewType` (the built-in union — `work-order-rules.ts` depends on it). Where `WorkOrder.crew_type` (and any other persisted work-order surface) is typed `CrewType | null`, widen to `string | null` with the comment:

```ts
  // string, not the CrewType union: cities can define custom crew types
  // (city_crew_types) that the AI generator may emit.
  crew_type: string | null;
```

Run `pnpm typecheck` after; chase any downstream comparisons that assumed the union (e.g. dispatch auto-suggest matching in `work-order-detail.tsx` / `dashboard-grid-data.ts` — string comparisons keep compiling; exhaustive switches would need a default arm).

- [ ] **Step 2: `work-order-ai.ts`**

- Change `AiGeneratedWorkOrder.crew_type` from `CrewType | null` to `string | null` (same comment as above; drop the now-unused `CrewType` import if nothing else uses it).
- New signature with a safe default so existing call sites/tests compile:

```ts
import type { CityCrewType } from "@/lib/crew-types";
import {
  type AiWorkOrder,
  buildAiWorkOrderSchema,
  buildGeminiWorkOrderSchema,
} from "./work-order-schema";
import { buildWorkOrderPrompt, WORK_ORDER_SYSTEM_PROMPT } from "./prompt";

export async function generateWorkOrderAI(
  classification: Classification,
  customTypes: CityCrewType[] = [],
): Promise<Result<AiGeneratedWorkOrder>> {
```

- Inside, build per-call artifacts (replaces the static references at lines 69, 74, 108):

```ts
    const customNames = customTypes.map((t) => t.name);
    const responseSchema = buildGeminiWorkOrderSchema(customNames);
    const workOrderSchema = buildAiWorkOrderSchema(customNames);
    // …
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
    // …
    const request = `${buildWorkOrderPrompt(customTypes)}
    // … (classification JSON append unchanged)
    const validation = workOrderSchema.safeParse(parsed);
```

- [ ] **Step 3: `classify-pipeline.ts`**

At the `AI_WORK_ORDER` block (line 378), fetch and thread the city's custom types:

```ts
import { fetchCityCrewTypes } from "@/lib/db/crew-types";
// …
  if (AI_WORK_ORDER) {
    // Custom crew types widen the generator's routing vocabulary; [] (no
    // customs / un-migrated DB) reproduces today's exact prompt + schema.
    const customTypes = await fetchCityCrewTypes(report.city_id);
    const aiResult = await generateWorkOrderAI(classification, customTypes);
```

`crewType` local (line 371) is inferred from `rulesWorkOrder.crew_type` (`CrewType | null`) then assigned an AI `string | null` — widen the declaration:

```ts
  let crewType: string | null = rulesWorkOrder.crew_type;
```

- [ ] **Step 4: Full test suite**

Run: `pnpm vitest run`
Expected: PASS. If `work-order-ai.test.ts` / `classify-pipeline.test.ts` mocks assert call signatures, the default parameter keeps old single-arg calls valid; fix any mock that asserts exact-args (`toHaveBeenCalledWith(classification)` → `toHaveBeenCalledWith(classification, [])` or `expect.anything()`).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/work-order-ai.ts src/lib/ai/classify-pipeline.ts src/lib/types.ts src/lib/ai/work-order-ai.test.ts src/lib/ai/classify-pipeline.test.ts
git commit -m "feat(ai): route work orders to per-city custom crew types via description-informed prompt"
```

---

### Task 11: Full verification + browser QA

- [ ] **Step 1: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls
```

All PASS. Report any failure verbatim — do not paper over.

- [ ] **Step 2: End-to-end browser pass (dev server)**

1. `/city/<slug>/members` as admin. Open **Invite member**: Role/Team menus are the new styled listboxes; keyboard-only operation works (Tab to trigger, Enter opens, arrows, Enter selects, Escape closes menu without closing the modal).
2. **New crew** dialog: Division menu shows color swatches. Crew type menu: built-ins listed, "New type…" row present.
3. Create type `street lights` with a 9-word description → Add disabled + counter shows words needed; extend to 12 words → creates, auto-selects, shows in menu with description hint.
4. Create the crew with the custom type; card shows `street lights` tag. Reopen dialog: type still listed (now DB-served).
5. In the crew dialog roster: **Invite by email** with a throwaway address → appears checked in roster; submit; reopen → invitee on crew; members table shows pending dispatcher in the crew's division.
6. Duplicate-name checks: same custom type name again → "already has a crew type"; name `paving` → reserved error.
7. Dropdown clipping: with the modal body scrolled, open every menu — renders above the modal (z-60), never clipped; near viewport bottom it flips upward.
8. Theme: repeat a spot-check in dark mode (tokens are theme-aware — verify contrast of hint text + swatches).

- [ ] **Step 3: AI routing smoke (optional, needs GEMINI key + AI_WORK_ORDER flag)**

Submit a demo report whose photo matches the custom type's description; inspect the created work order's `crew_type` in the DB or the work-order panel. Not CI-blocking — the schema/prompt unit tests are the gate; note the result either way.

- [ ] **Step 4: Update REVAMP/STATE docs only if they reference crew types (check, don't assume) and final commit + push**

```bash
git status   # confirm only intended files
git push origin main
```

(Remote is SSH — HTTPS 404s on this repo.)

---

## Self-Review Notes (already applied)

- **Spec coverage:** custom types + persistence (T1–T4, T7), ≥10-word description for AI (T1 gate, T2 storage, T4 server enforcement, T7 UI counter, T9 injection), nicer/consistent dropdowns (T5–T7), add-existing-members (already existed, preserved T7/T8), email invite incl. no-account users (T8 via existing `inviteUserByEmail`), AI routing (T9–T10). No gaps found.
- **Type consistency:** `CityCrewType` defined once (T1), imported everywhere; `createCrewType` returns `{ ok, name, description }` and T7 consumes exactly that; `inviteMember` returns `userId` (T4) and T8 consumes `res.userId`; builders named `buildAiWorkOrderSchema` / `buildGeminiWorkOrderSchema` / `buildWorkOrderPrompt` consistently across T9–T10.
- **Known judgment calls the executor may adjust:** exact insertion point of the invite button inside the fieldset; `log.warn` availability in T3; zod `.extend` vs `.omit().extend()` in T9; `scripts/run-migrations.mjs` vs Management API in T2 Step 2.
