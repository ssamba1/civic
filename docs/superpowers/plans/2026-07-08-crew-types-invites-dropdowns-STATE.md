# Execution State — Crew Types + Invites + Dropdowns

**Execution COMPLETE (2026-07-08).** Plan: [2026-07-08-crew-types-invites-dropdowns.md](./2026-07-08-crew-types-invites-dropdowns.md) — the authoritative task spec. Remaining: user applies migration 031 (below), then `CHECK_MIGRATION_031=1 pnpm test:rls`.

## Branch & commits
- Branch: `feat/crew-types-invites-dropdowns` (off `main` @ `083a83f`).
- Remote: SSH (`git@github.com:28gugales-dev/-Social-Impact-.git`).
- Base SHA for reviews = `083a83f` (the plan-doc commit).

| Task | Status | Commit |
|---|---|---|
| 1 — shared `src/lib/crew-types.ts` + tests | ✅ done, both reviews passed | `166d4e9` |
| 2 — migration `031` file + `tests/rls/city-crew-types.rls.test.ts` | ✅ files done + reviewed **safe to apply** | `0f5d265` |
| **2-APPLY — run 031 DDL on prod** | ⏳ **USER ACTION** (auto-mode classifier blocks schema pushes; re-confirmed 2026-07-08) | — |
| 3 — `src/lib/db/crew-types.ts` (`fetchCityCrewTypes`) | ✅ done, reviewed | `d0cb0c1` |
| 4 — server actions (`createCrewType`, free-text `crewTypeSchema`, `inviteMember`→`userId`) | ✅ done, both reviews | `737820b` |
| 5 — `MenuSelect` component (+ action-row-on-top tweak) | ✅ done, both reviews | `729b8e3`, `61de282` |
| 6 — Role/Team selects → MenuSelect + ERROR_COPY | ✅ done, both reviews | `0e3e48c` |
| 7 — crew dialog MenuSelect + new-type flow | ✅ done, both reviews | `5b80bf2` |
| 8 — invite-by-email in crew roster | ✅ done, both reviews | `7c5938a` |
| 9 — AI schema+prompt builders (zero-custom = byte-identical) | ✅ done + quality fix ($-pattern replace injection) | `c8d461a`, `628309e` |
| 10 — pipeline wiring + `crew_type` type widening | ✅ done, both reviews + custom-types test | `2763c46`, `143e3ad` |
| 11 — full gates + browser QA | ✅ typecheck clean · 351 unit + 25 RLS pass · biome clean on 19 touched files · Playwright QA 20/20 (menus, keyboard, Enter-guards, reserved-name copy, pre-031 graceful error, flip clamp, dark mode) | — |
| Final — code review + finish branch (merge/PR) | see repo history | — |

Related: load-balancing across same-type crews deferred to [issue #16](https://github.com/28gugales-dev/-Social-Impact-/issues/16).

## ⏳ PENDING USER ACTION — apply migration 031 to prod
Auto-mode classifier blocks prod schema writes (expected — memory: schema pushes = user's move). Files are committed. Run once outside auto mode from `-Social-Impact-/`:
```bash
set -a && . <(grep -E '^(SUPABASE_ACCESS_TOKEN|NEXT_PUBLIC_SUPABASE_URL)=' .env.local) && set +a && node -e '
const fs=require("fs");
const ref=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").match(/https?:\/\/([^.]+)\./)[1];
const sql=fs.readFileSync("supabase/migrations/20260708_031_city_crew_types.sql","utf8");
fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:"POST",headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({query:sql})}).then(async r=>{console.log("HTTP",r.status,await r.text());});
'
```
Then verify: `CHECK_MIGRATION_031=1 pnpm test:rls`.
Tasks 3–10 build/typecheck WITHOUT this (accessor returns `[]` on missing table). Only Task 11 browser QA + the RLS-with-CHECK run need it live.

## How execution runs (subagent-driven-development skill)
Per task: dispatch a fresh general-purpose implementer subagent (reads ONLY its task section from the plan file; controller supplies scene-setting + guardrails inline), then review. Heavy/risky tasks (4, 5, 7, 9, 10) → full TWO-stage review (spec-compliance subagent, THEN code-quality subagent). Trivial/declarative tasks (2, 3) → ONE combined reviewer. Implementer fixes via SendMessage (same agent), re-review, then mark done. One implementer at a time (shared git index).

## Per-task gates (IMPORTANT — repo baseline)
- `pnpm typecheck` = the real GLOBAL gate (currently clean repo-wide, must stay clean).
- Repo-wide `pnpm lint` is RED with ~325 PRE-EXISTING biome errors — DO NOT try to green it. Per task run `pnpm exec biome check <touched files>`; only touched files must be clean.
- Commit per task with explicit `git add <paths>`; do NOT push (finish branch at the end).

## Corrections already applied vs the plan (carry forward)
1. RLS test = NEW file `tests/rls/city-crew-types.rls.test.ts` mirroring `tests/rls/crews.rls.test.ts`, gated on `CHECK_MIGRATION_031`. IGNORE the plan's "edit scripts/test-rls.mjs" wording (the runner just spawns vitest on `tests/rls/`).
2. Task 1 polish added beyond plan: `isBuiltInCrewType` is now a type predicate (`name is BuiltInCrewType`); 2 extra edge tests. `NAME_RE` unchanged (must stay identical to the DB CHECK + server schema).

## Key project facts (learned this session)
- Migration apply: Management API `/v1/projects/{ref}/database/query` + `SUPABASE_ACCESS_TOKEN` PAT in `.env.local`; ref parsed from `NEXT_PUBLIC_SUPABASE_URL`. NOT `pnpm db:migrate`/`db push` (ledger unrecorded).
- Helper fns `is_staff()` / `current_user_city_id()` defined in migration 001; RLS mirrors crews (030).
- `work_orders.crew_type` + `crews.crew_type` are already free `text` — custom types persist with no schema change beyond the 031 catalog table.
