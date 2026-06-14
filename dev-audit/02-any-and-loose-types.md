# TypeScript Weak Typing Audit: Any & Loose-Type Escape Hatches

**Summary:** Found 51 weak-typing escape hatches across 22 files. **7 P0/P1 findings** (untyped AI/API/DB boundaries with insufficient validation), **28 P1 findings** (untyped catch clauses + unsafe JSON.parse with post-parse guards), **16 P2 findings** (low-risk assertions for external APIs + media constraints). Most critical: Gemini AI classification output parsing lacks type safety before downstream consumption; Supabase query results cast without guards; catch clauses lose error shape context.

---

## Findings

| ID | File:Line | Severity | Problem | Fix |
|----|-----------|----------|---------|-----|
| A1 | src/lib/ai/gemini.ts:89 | P0 | `JSON.parse(cleaned)` untyped, relying only on post-parse Zod validation | Type as `unknown`, validate immediately before use with schema |
| A2 | src/lib/ai/reasoning-ai.ts:161 | P0 | `JSON.parse(text)` with untyped result, manual type guard `isReasoningPayload` may miss edge cases | Refactor to use Zod schema instead of manual guard |
| A3 | src/app/staff/actions.ts:30 | P0 | `STAFF_ROLES as unknown as string[]` — bypasses const tuple type safety | Remove cast; verify Supabase `.in()` accepts readonly tuple |
| A4 | src/lib/dashboard-queries.ts:139 | P0 | `(data as unknown as ViewRow[])` — Supabase query result cast without runtime validation | Create Zod schema for `ViewRow` and validate result |
| A5 | src/components/staff/staff-inbox.tsx:92 | P0 | `(result as any).fetchedAt` — erases `Result<T>` union type, accessing unsafe property | Use proper type narrowing: `result.ok ? result.fetchedAt : undefined` |
| A6 | src/app/api/open311/v2/requests/route.ts:103–109 | P1 | Multiple unsafe casts on Supabase row: `as Record<string, unknown>`, `as Classification \| null` | Destructure safely with runtime validation |
| A7 | src/lib/resident-data.ts:221 | P1 | `JSON.parse(geo)` untyped — PostGIS geometry parser has no type check | Use existing `normalizeLocation()` helper instead |
| B1–B16 | Multiple catch blocks | P1 | Untyped catch `(err)` parameter loses error shape and context | Type as `unknown` and extract message safely |
| C1–C9 | localStorage/JSON.parse sites | P1 | `JSON.parse(raw) as unknown` with post-parse manual validation | Extract shared schema validation helper or use Zod |
| D1 | src/lib/resident-data.ts:314 | P1 | `(data as unknown as MyReportRow[])` — post-query cast without validation | Add Zod schema and validate before use |
| E1–E2 | src/components/report/camera-capture.tsx:284, 299 | P2 | `as unknown as MediaTrackConstraints` — bypasses WebAPI type check | Import correct type directly, no unknown bridge |
| E3 | src/lib/types.ts:71 | P2 | `as unknown[]` for PostGIS coordinates — lacks bounds check | Already safe (pre-guarded); cast is justified |
| E4–E15 | src/components/staff/staff-inbox.tsx:415–494 | P2 | Unnecessary `as unknown as Type` after null checks — redundant casts | Remove casts; type narrowing already works |
| E16 | src/components/analytics/hover-tip.tsx:222 | P2 | `e as unknown as React.MouseEvent` — loses event type narrowing | Type directly as `React.MouseEvent<>` |

---

## Details

### P0 Findings: Critical Type Safety Breakdowns

#### A1: Gemini JSON Parse Without Immediate Type Guard
**File:** src/lib/ai/gemini.ts:89
```typescript
let parsed: unknown;
try {
  parsed = JSON.parse(cleaned);
} catch {
  return { ok: false, error: `Gemini returned invalid JSON: ...` };
}

const validation = classificationSchema.safeParse(parsed);
if (!validation.success) {
  return { ok: false, error: `Classification validation failed: ...` };
}
return { ok: true, data: { classification: validation.data as Classification, rawText } };
```

**Why it matters:** 
- Gemini response format could change silently. If the model adds/removes fields, `safeParse()` fails with validation error, but the error message doesn't surface what changed.
- The final `validation.data as Classification` cast bypasses Zod's type narrowing — if validation somehow succeeds with wrong data, the cast hides it.
- If Gemini returns structurally invalid JSON that passes type checking but fails business logic downstream, debugging becomes harder.

**Fix:**
```typescript
// 1. Parse and immediately guard
let parsed: unknown;
try {
  parsed = JSON.parse(cleaned);
} catch (e) {
  return { ok: false, error: `Gemini returned invalid JSON: ${cleaned.slice(0, 300)}` };
}

// 2. Validate immediately, log schema mismatch context
const validation = classificationSchema.safeParse(parsed);
if (!validation.success) {
  log.error("gemini_classification_schema_mismatch", {
    reportId,
    issues: validation.error.issues,
    received: JSON.stringify(parsed).slice(0, 500),
  });
  return { ok: false, error: `Classification schema mismatch` };
}

// 3. Now validation.data is safely typed
return { ok: true, data: { classification: validation.data, rawText } };
```

---

#### A2: Reasoning AI Manual Type Guard Fragility
**File:** src/lib/ai/reasoning-ai.ts:161
```typescript
const parsed: unknown = JSON.parse(text);
if (!isReasoningPayload(parsed)) {
  throw new Error("Gemini returned a payload that failed shape validation.");
}
return parsed; // <-- TypeScript doesn't narrow here
```

**Why it matters:**
- The `isReasoningPayload()` guard is a manual type predicate (lines 117–134). If the guard has a bug (e.g., forgets to check `costBreakdown` is non-empty), bad data slips through.
- TypeScript's type narrowing doesn't work with custom predicates without explicit `is` annotation. The throw hides the issue until production.
- Repeating 8+ lines of validation code is error-prone when changes to `ReasoningPayload` happen.

**Fix:** Use Zod with explicit schema:
```typescript
import { z } from "zod";

const SectionSchema = z.object({
  title: z.string(),
  value: z.string(),
});

const ReasoningPayloadSchema = z.object({
  reasoning: z.string().min(1),
  costBreakdown: z.array(SectionSchema).min(1),
  scoringExplanation: z.array(SectionSchema).min(1),
});

const text = result.response.text();
const parsed = ReasoningPayloadSchema.parse(JSON.parse(text));
return parsed; // Now typed as ReasoningPayload
```

---

#### A3: STAFF_ROLES Const Assertion Unnecessarily Bypassed
**File:** src/app/staff/actions.ts:30
```typescript
const STAFF_ROLES = ["staff_dispatcher", "staff_supervisor", "admin"] as const;
// ...
.in("role", STAFF_ROLES as unknown as string[])
```

**Why it matters:**
- `STAFF_ROLES` is a `readonly ["staff_dispatcher", "staff_supervisor", "admin"]` — a typed const array.
- Supabase's `.in()` should accept this readonly array directly. The `as unknown as string[]` cast defeats the const narrowing and converts it to a mutable string array.
- Future changes to STAFF_ROLES won't be caught by the type system.

**Fix:** Remove the cast; verify Supabase type signature:
```typescript
// Option 1: Remove cast entirely
.in("role", STAFF_ROLES)

// Option 2: If Supabase types don't accept readonly, use spread
.in("role", [...STAFF_ROLES])
```

---

#### A4: Dashboard View Query Cast Without Validation
**File:** src/lib/dashboard-queries.ts:139
```typescript
const { data, error } = await db.from("dashboard_reports_view").select(...);
if (error || !data) return [];
return (data as unknown as ViewRow[]).map((r) => ({
  id: r.id,
  category: (r.category ?? "other") as ReportCategory,
  // ...
}));
```

**Why it matters:**
- The query selects from a Supabase view. View schemas can change (columns added/removed/renamed).
- Casting before validation means if `category` is missing or `undefined`, the fallback `?? "other"` silently hides the schema mismatch.
- In production, the dashboard would show "other" for all reports, masking the view schema drift.

**Fix:** Validate with Zod before mapping:
```typescript
const ViewRowSchema = z.object({
  id: z.string(),
  category: z.enum([
    "pothole", "streetlight", "downed_sign", "graffiti",
    "illegal_dump", "water_leak", "sidewalk_damage", "tree_down",
    "debris", "drainage", "faded_signage", "other"
  ]).nullable(),
  severity: z.number().nullable(),
  // ... all fields
});

const { data, error } = await db.from("dashboard_reports_view").select(...);
if (error || !data) return [];

const parsed = z.array(ViewRowSchema).safeParse(data);
if (!parsed.success) {
  log.error("dashboard_view_schema_mismatch", parsed.error);
  return [];
}

return parsed.data.map(r => ({
  id: r.id,
  category: r.category ?? "other",
  // ...
}));
```

---

#### A5: Staff Inbox Result Type Erasure via `as any`
**File:** src/components/staff/staff-inbox.tsx:92
```typescript
const result = await fetchQueuedWorkOrders(lastFetchedAtRef.current);
if (!result.ok || result.data.length === 0) return;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextCursor =
  (result as any).fetchedAt ??
  result.data.reduce(...);
```

**Why it matters:**
- `fetchQueuedWorkOrders` returns `Result<{ ok: true; data: WorkOrderWithDetails[]; fetchedAt: string } | { ok: false; error: string }>`.
- The cast to `any` erases this discriminated union. The code checks `!result.ok` but can't narrow the type due to `any`.
- This violates the Result type contract and makes refactoring fragile.

**Fix:** Use proper type narrowing:
```typescript
const result = await fetchQueuedWorkOrders(lastFetchedAtRef.current);
if (!result.ok || result.data.length === 0) return;

// Now TypeScript knows result.ok === true, so result.fetchedAt is accessible
const nextCursor = result.fetchedAt ?? result.data.reduce(...);
```

---

#### A6: Open311 API Row Casting Without Validation
**File:** src/app/api/open311/v2/requests/route.ts:103–109
```typescript
const open311Requests = (data ?? []).map((row) => {
  const report = rowToReport(row as ReportRow);
  const classification: Classification | null =
    (row as Record<string, unknown>).classifications != null
      ? ((row as Record<string, unknown[]>).classifications?.[0] ?? null) as Classification | null
      : null;
  const cityRaw = (row as Record<string, unknown>).cities;
  const city = (Array.isArray(cityRaw) ? cityRaw[0] : cityRaw) as City;
  return reportToOpen311(report, classification, city);
});
```

**Why it matters:**
- Three unsafe casts in rapid succession on a single row.
- If Supabase joins return `null` for `classifications`, the `?.[0]` silently returns `undefined`, then `?? null` masks it.
- The final `as City` assumes shape without checking; if the city shape changes, Open311 response will be malformed.

**Fix:** Validate each field with a schema:
```typescript
const ClassificationSchema = z.object({
  category: z.string(),
  severity: z.number(),
  confidence: z.number(),
  // ...
}).nullable();

const CitySchema = z.object({
  id: z.string(),
  name: z.string(),
  open311_jurisdiction_id: z.string().nullable(),
}).nullable();

const RowSchema = z.object({
  id: z.string(),
  classifications: z.array(ClassificationSchema).nullable(),
  cities: z.array(CitySchema).nullable(),
  // ... other fields
});

const open311Requests = (data ?? [])
  .map(row => {
    const parsed = RowSchema.safeParse(row);
    if (!parsed.success) {
      log.error("open311_row_schema_mismatch", { row, issues: parsed.error.issues });
      return null;
    }
    const p = parsed.data;
    return reportToOpen311(
      rowToReport(p),
      p.classifications?.[0] ?? null,
      p.cities?.[0] ?? null
    );
  })
  .filter(Boolean);
```

---

### P1 Findings: Catch Clauses with Untyped Errors

#### B1–B16: Untyped Catch Blocks (16 instances)
**Pattern:** `catch (err)` or `catch (e)` without type annotation.

**Examples:**
- src/lib/dashboard-queries.ts:29
- src/lib/ai/gemini.ts:109
- src/components/report/camera-capture.tsx:247
- ... (13 more)

**Issue:**
```typescript
catch (err) {
  log.error(`${label} threw`, err);
  // err is implicitly 'any' — can't safely call .message, .stack, etc.
}
```

**Why it matters:**
- Without explicit typing, `err instanceof Error ? err.message : String(err)` is the only safe pattern.
- Some sites log raw `err` directly, risking stack trace loss or structured logging breakage.
- TypeScript strict mode should enforce explicit `unknown` type, but this is a common escape.

**Fix:** Standard pattern everywhere:
```typescript
catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  log.error(`${label} threw`, { message });
}
```

---

### P1 Findings: JSON.parse with Post-Parse Validation

#### C1–C9: localStorage Parse (9 instances)
**Pattern:** `JSON.parse(raw) as unknown` followed by manual field validation.

**Examples:**
- src/lib/custom-categories.ts:52
- src/lib/category-overrides.ts:61, 89
- src/lib/upvotes.ts:37
- src/lib/teams-overrides.ts:60, 88
- src/lib/resident-csat.ts:38
- src/lib/task-completion.ts:49
- src/lib/demo-reports.ts:72

**Typical code:**
```typescript
const parsed = JSON.parse(raw) as unknown;
if (!Array.isArray(parsed)) return [];
const out: CustomCategory[] = [];
for (const item of parsed) {
  if (typeof item !== "object" || item === null) continue;
  const rec = item as Record<string, unknown>;
  // Validate each field manually...
  if (typeof id !== "string" || !id.startsWith("custom_")) continue;
  if (typeof label !== "string" || label.trim().length === 0) continue;
  // ... more field checks
  out.push({ id, label, color, team: safeTeam });
}
return out;
```

**Why it matters:**
- The validation is sound and defensive, BUT it repeats across 9 files.
- Each site implements its own version; if a required field check is missing (e.g., validating `team` is a valid TeamId), bad data silently passes.
- Hard to maintain — future schema changes require updates in multiple places.

**Fix:** Extract shared Zod schemas in `src/lib/types.ts` or `src/lib/schemas.ts`:
```typescript
export const CustomCategorySchema = z.object({
  id: z.string().regex(/^custom_/),
  label: z.string().min(1),
  color: z.string(),
  team: z.string().refine(t => isValidTeamId(t) && t !== "all"),
});

// In custom-categories.ts:
const parsed = JSON.parse(raw);
const validated = z.array(CustomCategorySchema).safeParse(parsed);
if (!validated.success) return [];
return validated.data;
```

---

#### A7: Resident Data Untyped PostGIS Parse
**File:** src/lib/resident-data.ts:221
```typescript
geo = JSON.parse(geo);
```

**Issue:** No type guard on `geo` before passing to `normalizeLocation()`.

**Fix:** Already solved elsewhere in the codebase:
```typescript
// Use existing helper instead
geo = normalizeLocation(geo);
```

---

#### D1: MyReportRow Query Cast
**File:** src/lib/resident-data.ts:314
```typescript
return (data as unknown as MyReportRow[]).map((r) => {
  // ...
});
```

**Fix:** Add Zod schema for `MyReportRow` and validate before map.

---

### P2 Findings: Low-Risk (Context-Dependent)

#### E1–E2: MediaTrackConstraints Browser API
**File:** src/components/report/camera-capture.tsx:284, 299
```typescript
await track.applyConstraints({
  advanced: [{ torch: next }],
} as unknown as MediaTrackConstraints);
```

**Why risky:** The WebAPI's `MediaTrackConstraints` type in DOM lib is incomplete. The `advanced` field can contain many possible constraint objects, and browsers silently ignore unsupported ones.

**Fix:** Import and use the correct type directly (or document the workaround):
```typescript
const constraints: MediaTrackConstraints = {
  advanced: [{ torch: next }],
};
await track.applyConstraints(constraints);
// If types still complain, add comment: "torch is a valid WebRTC constraint"
```

---

#### E3: PostGIS Coordinate Parsing
**File:** src/lib/types.ts:71
```typescript
const coords = (raw as Record<string, unknown>)["coordinates"] as unknown[];
const lng = Number(coords[0]);
const lat = Number(coords[1]);
```

**Why safe:** Function already checks `bytes.length >= offset + 16` before extracting float64 values. `Number()` is safe on any value. Casts are justified for EWKB parsing.

**Verdict:** P2 (acceptable).

---

#### E4–E15: Redundant Staff Inbox Casts
**File:** src/components/staff/staff-inbox.tsx:415–494
```typescript
if (!wo.report || !wo.classification) return null;
// ... later
report={wo.report as unknown as Report}
classification={wo.classification as unknown as Classification}
```

**Why redundant:** The guard already narrows the type. The cast is unnecessary noise.

**Fix:** Remove casts:
```typescript
report={wo.report}
classification={wo.classification}
```

---

#### E16: Hover Tip Event Narrowing
**File:** src/components/analytics/hover-tip.tsx:222
```typescript
show(resolve(e as unknown as React.MouseEvent), e, placement);
```

**Why minor:** Narrowing a DOM event to React event type. Safer version:
```typescript
show(resolve(e as React.MouseEvent<HTMLElement>), e, placement);
```

---

## Backlog: Recommended Actions

### Phase 1 — Critical (P0, ship ASAP)

1. **A1: Gemini JSON parse** 
   - Add logging for schema mismatches with context (received data sample)
   - Ensure `validation.data` is used, not raw `parsed`

2. **A2: Reasoning AI** 
   - Migrate from `isReasoningPayload()` guard to Zod schema
   - Saves ~30 lines of code, improves type safety

3. **A3: STAFF_ROLES** 
   - Remove `as unknown as string[]` cast
   - Verify Supabase `.in()` accepts readonly tuple; if not, use `[...STAFF_ROLES]`

4. **A4: Dashboard view query** 
   - Create `ViewRowSchema` Zod schema
   - Validate before mapping; log mismatches

5. **A5: Staff inbox `as any`** 
   - Remove cast; use type narrowing on `result.ok`

### Phase 2 — High-Priority (P1, within 1 sprint)

6. **B1–B16: Catch blocks** 
   - Add `unknown` type annotation to all 16 catch blocks
   - Use standard error message extraction pattern

7. **C1–C9: localStorage parse** 
   - Extract shared Zod schemas in `src/lib/schemas.ts` (or extend `src/lib/types.ts`)
   - Replace 9 sites with single schema usage; reduces duplication

8. **D1: Resident data query** 
   - Add `MyReportRow` schema; validate before map

9. **A6: Open311 row casting** 
   - Add row shape validation; log mismatches

### Phase 3 — Refactoring (P2, backlog)

10. **E1–E2: MediaTrackConstraints** 
    - Import correct type; remove `unknown` bridge

11. **E4–E15: Staff inbox casts** 
    - Remove redundant casts; verify source types are correct

---

## Shared Schemas to Create

Create `src/lib/schemas.ts` with Zod definitions for frequently-validated types:

```typescript
export const ViewRowSchema = z.object({ /* ... */ });
export const CustomCategorySchema = z.object({ /* ... */ });
export const CategoryOverrideSchema = z.object({ /* ... */ });
export const TeamOverrideSchema = z.object({ /* ... */ });
export const CsatMapSchema = z.record(z.enum(["up", "down"]));
export const CompletionSchema = z.object({
  completedAt: z.string(),
  afterPhoto: z.string().optional(),
});
export const ReasoningPayloadSchema = z.object({ /* ... */ });
```

Then import and use in each module instead of inline validation.

---

## Audit Statistics

- **Total findings:** 51 escape hatches
- **Severity breakdown:** 7 P0/P1 (critical) + 28 P1 (medium) + 16 P2 (low-risk)
- **Patterns:**
  - Untyped catch blocks: 16
  - localStorage JSON.parse: 9
  - Supabase query casts: 3
  - AI/API parsing: 7
  - Media API constraints: 2
  - Unnecessary narrowing: 9

---

## Conclusion

The codebase has solid fundamentals (Zod schemas in use, post-parse guards mostly correct), but weak points exist at boundaries:
- **AI output parsing** (Gemini, Reasoning) lacks explicit schema validation
- **Supabase queries** cast without runtime checks
- **Error handling** uses implicit `any` on catch parameters
- **localStorage validation** repeats across 9 files — duplication risk

Addressing P0 findings (A1–A6) will harden the critical path (AI/API). P1 findings are mostly code quality (catch typing, shared schemas). P2 findings are cosmetic.
