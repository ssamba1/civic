# Advanced Routing: Recursive Org Tree + AI Route Gen + Cost/SLA Load Balance

Status: proposed (2026-07-09). Supersedes flat `team_key` → `crews` routing.

## Goal

Three capabilities beyond current 2-level routing:

1. **Arbitrary-depth org tree**: team → subteam → … → crew/contractor, unlimited nesting.
2. **AI-generated routes**: AI builds the org tree at onboarding AND picks the leaf unit per report.
3. **Cost/SLA-weighted load balance** across a mix of internal crews and external contractors.

## Current state (baseline)

- `city_teams` (per-city team config, `categories text[]`), `20260618_019`
- `crews` + `crew_members` + `crew_types` (one level under `team_key`), `030`, `031`
- `resolveTeamKeyForCategory()` → `resolve_zone_team()` RPC override → `autoAssignCrew()` (fewest-open-WO), `src/lib/onboarding/city-teams.ts`, `src/lib/ai/classify-pipeline.ts`, `src/lib/ai/crew-assign.ts`
- No contractor/vendor model. No stored capacity. Load computed live from open WO counts.

## Design

### 1. `org_units`: recursive tree (ltree)

Requires Postgres `ltree` extension. Single self-referencing table subsumes `city_teams`, `crews`, `crew_types`.

```sql
create extension if not exists ltree;

create table org_units (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete cascade,
  parent_id uuid references org_units(id) on delete cascade,
  kind text not null check (kind in ('team','subteam','crew','contractor')),
  key text not null,
  label text not null,
  categories text[],              -- report categories this unit accepts; null = inherit parent
  skills text[],                  -- crew_type keys this unit can perform
  is_contractor boolean not null default false,
  capacity int,                   -- max concurrent open WOs; null = unbounded
  cost_per_job numeric,           -- contractor pricing; null/0 = internal
  sla_hours int,                  -- expected turnaround; feeds SLA-risk score
  active boolean not null default true,
  path ltree not null,            -- materialized path, maintained by trigger
  unique (city_id, parent_id, key)
);
create index org_units_path_gist on org_units using gist (path);
create index org_units_city on org_units (city_id) where active;
```

- `path` maintained by BEFORE INSERT/UPDATE trigger: `path = parent.path || key` (or `key` at root).
- Subtree query: `where path <@ :team_path`. Leaves = units with no active children.
- RLS: default deny; city-scoped select for staff of that city; write restricted to admins.

**Backfill:** map existing `city_teams` → root `team` rows, `crews` → `crew` leaves under matching `team_key`, `crew_types` → `skills`. Keep old tables one release for rollback, then drop.

### 2. Routing = prune + score

Replaces `resolveTeamKeyForCategory` + `autoAssignCrew`.

**a. `resolveRouteSubtree(cityId, category, crewType)`**: descend tree, return candidate leaf units where `category ∈ categories` (inherited) AND `crewType ∈ skills`. Zone override (`resolve_zone_team`) still applies at team root.

**b. `assignBestUnit(candidates, workOrder)`**: hard filter then min-score:

```
filter: active AND skillMatch AND open_wos < capacity (capacity null = pass)

score(u) =
    w_load  * (open_wos(u) / capacity_or_soft(u))     -- normalized fill
  + w_cost  * (cost_per_job(u) / max_cost)            -- internal ≈ 0
  + w_sla   * slaBreachRisk(u, workOrder.due_at)      -- 0..1, would assigning breach?
  - w_skill * skillMatchStrength(u, crewType)
```

Weights per-city (`city_config`). Default = cost/SLA weighted (chosen): `w_load .3, w_cost .3, w_sla .3, w_skill .1`. Contractor wins only when cheaper-or-faster net. Greedy per-report is fine at pilot scale; batch optimal assignment (min-cost-flow) is a later upgrade if reports arrive in bulk.

`open_wos(u)` = live count (existing pattern in `crew-assign.ts:100`), now keyed on `assigned_unit_id`.

### 3. AI route generation (both jobs, server-side only)

**a. Onboarding tree-gen**: new `/api/ai/org-tree` route. Input: city ops prose + category list. Output: proposed `org_units` insert set (validated by Zod schema mirroring table). **Human approves in an admin UI before any write.** One-time per city.

**b. Per-report leaf pick**: extend `buildAiWorkOrderSchema` with `route_candidates` (leaf keys + reason) instead of single `crew_hint`. Prompt is fed only the *pruned subtree* for the report's category (not whole org) to keep tokens low. AI pick is a *hint*; `assignBestUnit` scoring is authoritative. AI breaks ties / supplies skill nuance.

## Build order

1. **Migration** `org_units` + ltree ext + trigger + RLS + backfill. touches `supabase/migrations/`. **hard rule 10: needs explicit owner ok before writing.**
2. `resolveRouteSubtree()`: new, replaces `resolveTeamKeyForCategory`.
3. `assignBestUnit()` scoring, replaces `autoAssignCrew`. Unit tests on score ordering + capacity filter + contractor spillover.
4. Work-order schema: `route_candidates` field; wire into `classify-pipeline.ts`.
5. `/api/ai/org-tree` onboarding route + approval UI.
6. Migrate `teams-data.ts` / AI chat `getTeamWorkload` to `org_units`.
7. RLS regression tests (`tests/rls/`) for `org_units`.

## Open / risks

- ltree ext must be enabled on Supabase (check `list_extensions`).
- Backfill correctness, snapshot old tables, diff assignments before/after on seed data.
- Cost/SLA weights need real contractor data to tune; start with defaults + per-city override.
- Open311 conformance unaffected (routing is internal; service_code mapping unchanged).
