# Crew Types + AI Crew Assignment: Plan

> Status: BUILT on branch feat/crew-types-ai (P1, P4 + audit fixes + override
> re-assign), 2026-07-08. Migration 031 authored, NOT applied to live DB.
> Builds on migration 030 crews (commit `c2c4e27`).

## 1. The ask, decoded

1. **Create crew types with descriptions**: today `crew_type` is a hardcoded 7-value
   enum duplicated in three files. Cities should define their own types (label +
   description of what work that crew type handles).
2. **Hollow shells**: create a crew with a type and no members yet; AI still
   targets it, staff fill the roster later.
3. **AI uses this when assigning tasks**: the pipeline should (a) pick `crew_type`
   from the city's own type list using the descriptions, and (b) auto-assign an
   actual crew (`work_orders.assigned_crew_id`).
4. **New people get role, team, crew**: invite flow assigns all three.

## 2. What already exists (verified on main)

| Piece | State |
|---|---|
| `crews` table (030) | `id, city_id, team_key, name, crew_type text NULL, active, created_at`; unique `(city_id, team_key, name)`; staff-only RLS. **No description column.** |
| `crew_members` | `(crew_id, user_id)` PK + `is_lead`. |
| Hollow shells | Already possible. `createCrew` inserts without members; `setCrewMembers` is a separate call. UI just doesn't say so. |
| Invite flow | `inviteMember`/`updateMember` already take `role`, `teamKey`, `crewIds[]` and sync `crew_members` (lead flags preserved). Modals have role select, team select, crew checklist. **Req 4 is ~done**; only polish left. |
| Crew type enum | Hardcoded ×3: `src/lib/ai/work-order-schema.ts` (`CREW_TYPES`, zod + Gemini enum), `crew-actions.ts` (`CREW_TYPE_VALUES`), `crews-panel.tsx` (`CREW_TYPE_OPTIONS`). Values: paving, line_crew, sign_crew, cleanup, concrete, arborist, drain_crew. |
| AI → crew_type | `generateWorkOrderAI(classification)` (flag `AI_WORK_ORDER=1`) returns `crew_type` from the static enum. Rules fallback (`work-order-rules.ts`) stamps it from a static category table. No city context reaches the generator. |
| AI → crew | **Nothing.** Pipeline never touches `crews`. `assigned_crew_id` written only by manual staff actions (`dispatchWorkOrder`, `assignCrewToReport`). Grid dropdown does client-side "· suggested" sort where `crews.crew_type === work_orders.crew_type`. |
| Embeddings | None in project (no pgvector). Dedup is PostGIS-based. |

## 3. Design decisions

### D1: `crew_types` table, per-city, seeded with the 7 defaults
Mirrors the `issue_types` precedent (migration 027: per-city config, static
fallback when empty). `crews.crew_type` stays a **soft key reference** (no hard
FK), same as `issue_types.team_key`; deleting a type never breaks crews.

```sql
-- 20260707_031_crew_types.sql (sketch)
create table crew_types (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references cities(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  label       text not null check (length(trim(label)) > 0),
  description text not null default '',   -- AI-facing: what work this crew type does
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (city_id, key)
);
-- RLS: mirror crews exactly (staff select/write scoped to current_user_city_id();
-- admin gating enforced at the server-action layer, like crew CRUD).
-- Seed: insert the 7 defaults for every existing city (on conflict do nothing).
```

App fallback: `fetchCityCrewTypes(cityId)` returns static `DEFAULT_CREW_TYPES`
(with descriptions) when the table is missing or the city has zero rows, same
graceful-degrade pattern as the rest of the crews code pre-migration.

### D2: Two-layer AI assignment: LLM picks the *type*, deterministic code picks the *crew*
- **Layer 1 (LLM)**: `generateWorkOrderAI` gains city context. The city's active
  crew types are injected into the prompt as `key, description` lines, and the
  Gemini `responseSchema` enum + zod enum are **built per-call** from those keys.
  Descriptions are what make this work, the model matches "cracked sidewalk
  panel" to `concrete, Flatwork, sidewalk panel replacement, ADA ramps`.
- **Layer 2 (deterministic, no LLM)**: after the `team_key` stamp in
  `classify-pipeline.ts` (the slot between the team stamp and `stampWorkOrderCost`),
  query candidates: `crews WHERE city_id AND team_key = resolved AND crew_type =
  wo.crew_type AND active`. Rank: **staffed before hollow → fewest open work
  orders → name** (deterministic tie-break). Write `assigned_crew_id` best-effort,
  only if currently null. Hollow shells are eligible (the ask) but staffed crews win.

Why no LLM in layer 2: the ranking signals (roster size, current load) live in
the DB, not in prose; deterministic = unit-testable, free, zero rate-limit
pressure. An LLM adds nothing until crews carry free-text capability notes.

Flag: `AI_CREW_ASSIGN=1` (default off), same pattern as `AI_WORK_ORDER` /
`DEDUP_REPORTS` in `src/lib/ai/config.ts`. Runs for emergencies too (they skip
manual review by design); skipped when `needs_manual_review`. A human is about
to look anyway, and `overrideClassification` re-routing would orphan the pick.

### D3: Single source of truth for types
New `src/lib/crew-types.ts`: `DEFAULT_CREW_TYPES` (key, label, description) +
`fetchCityCrewTypes`. The three hardcoded copies become consumers. The zod/Gemini
schemas in `work-order-schema.ts` become builder functions taking a key list.
`crew-actions.ts` validation switches from static `z.enum` to a
membership check against the city's fetched keys (fallback: defaults).

### D4: Hollow shell is a UI/copy problem, not a schema one
Create-crew dialog: members step becomes explicitly optional ("Create now, staff
later. AI can still route work to this crew"). Crews panel shows a "no members
yet" badge on hollow crews so admins see what needs staffing.

### D5: Invite polish only
Role+team+crew already ships. Add to `CrewChecklist` rows: crew-type label badge
+ description tooltip (so the inviter knows what they're assigning someone to).

### Non-goals (this pass)
- Per-crew (instance) descriptions or skill tags, types carry the semantics.
- LLM-ranked crew instances, embeddings, load forecasting.
- Per-city override of the **rules** (non-AI) category→crew_type table.
- Schedules/shifts/capacity limits.

## 4. Work plan

### P1: Schema + lib (needs owner OK for `supabase/migrations/`)
- `supabase/migrations/20260707_031_crew_types.sql`: table, RLS, seed (above).
- `src/lib/crew-types.ts`: defaults + `fetchCityCrewTypes` (service-role, degrade-to-defaults).
- `tests/rls/`: anon denied read/write; staff city-scoping (CHECK_MIGRATION_031 gate, mirror 030 tests).

### P2: Types admin UI
- `saveCrewType` / `deleteCrewType` server actions in `crew-actions.ts` (admin-gated, zod: key slug, label ≤80, description ≤500).
- `src/components/crews/crew-types-panel.tsx`: CRUD list on the members page beside the Crews panel (same card idiom as `crews-panel.tsx`).
- `crews-panel.tsx` type `<select>` fed from city types (props from `members/page.tsx`), shows description under the select.
- Dynamic validation in `createCrew`/`updateCrew`.

### P3: AI wiring
- `work-order-schema.ts` → `buildAiWorkOrderSchema(keys)` + `buildGeminiWorkOrderSchema(keys)`.
- `work-order-ai.ts` → `generateWorkOrderAI(classification, crewTypes)`; prompt gains a "CREW TYPES AVAILABLE IN THIS CITY" block with descriptions; keep null-allowed for `other`.
- `classify-pipeline.ts` → fetch city types once (before step 9), pass to generator; add crew auto-assign step per D2.
- `src/lib/db/crews.ts` → `fetchCrewCandidates(cityId, teamKey, crewType)` returning `{id, name, memberCount, openWorkOrders}` (open = assigned WOs whose report status ∉ closed/merged/rejected).
- `config.ts` → `AI_CREW_ASSIGN`.
- Unit tests: picker ranking (staffed>hollow, load, tie-break), schema builders, pipeline step (mock supabase, mirror existing classify-pipeline.test.ts fixtures).

### P4: Invite/display polish
- `member-modal.tsx` CrewChecklist: type badge + description title-attr.
- Grid `CrewAssignControl`: unchanged (already suggests by type match); optionally show auto-assigned crew provenance ("assigned by AI") later.

### Verify (definition of done)
`pnpm typecheck` / `lint` / `test` green; RLS suite with `CHECK_MIGRATION_031`;
manual: create type → hollow crew → submit report → WO carries type + crew;
invite member with role+team+crew.

## 5. Risks / pitfalls
- **Dynamic Gemini enum**: `responseSchema` is a plain object. Building per-call is safe; keep the zod re-validation belt-and-suspenders (fence-strip + parse) since enum drift between prompt and schema is possible.
- **Empty/missing table**: every read path must degrade to `DEFAULT_CREW_TYPES` (pre-031 DBs, new cities). Follow `fetchCityCrews`'s never-throw idiom.
- **Orphan keys**: deleting a type leaves `crews.crew_type` pointing at a dead key, render raw key, still assignable; matches issue_types behavior.
- **Rules path** (`AI_WORK_ORDER=0`, current default) still emits only the 7 default type keys. Custom types only flow from the AI path or manual crew edits. Acceptable; noted as a later per-city rules override.
- **No demo/localStorage leg**: crews + types are live-DB staff surfaces (like migration 030). Demo city works via seeded defaults.

## 6. Owner gates
- Migration 031 authoring touches `supabase/migrations/` (agents.md rule 10). This plan is the ask; explicit OK still required before writing it.
- Applying 024-031 to live DB: `DATABASE_URL='postgresql://…' node scripts/run-migrations.mjs`.
- `AI_WORK_ORDER=1` + `AI_CREW_ASSIGN=1` env to see the full loop live.
