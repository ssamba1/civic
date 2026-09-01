# RLS regression tests

Row-Level-Security regression tests for the Civic Postgres schema. These enforce
`AGENTS.md` hard rule #3 — *"RLS on every table. Default deny. Tests in
`tests/rls/` must pass before merging schema changes."*

They are **integration** tests: they run against a real Supabase/Postgres
instance, hitting it with the anon key (RLS enforced) and the service-role key
(RLS bypassing). They are **opt-in** — the default `pnpm test` still collects
them, but each suite stays in `skipIf` skip mode (and passes) unless a test
database is configured. This keeps the everyday unit run hermetic and offline,
and keeps CI green with no secrets.

## Files

Thirteen suites. **Read the gate column before concluding a suite ran** — three
different gating conventions are in play, and a suite whose variables are unset
passes as skipped, which looks identical to passing.

Two gate families:

- **`R`** — `RUN_RLS_TESTS=1` plus `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **`T`** — `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.

Some suites additionally gate individual assertions on a `CHECK_MIGRATION_*`
flag, so that a migration which has not been applied yet reads as "not checked"
rather than as a regression. Those are listed in the third column and are opt-in
on top of the gate.

| File | Covers | Gate | Extra flags |
| --- | --- | --- | --- |
| `rls.test.ts` | anon default-deny on `reports`/`classifications`/`work_orders`/`merges`/`audit_log`/`error_log`; anon can read `dashboard_reports_view`; anon cannot INSERT a report; **service-role bypass control** | `R` | `CHECK_MIGRATION_012` |
| `storage-and-cross-user.rls.test.ts` | **cross-user read isolation** (a resident can't read another's report); **storage cross-folder INSERT (T1.13)** — a city-A user can't upload into city-B's folder | `T` (+`R`) | — |
| `city-config.rls.test.ts` | `city_departments`, `category_routing`, `sla_targets` public-read/staff-write; `cost_rules`, `provision_jobs` staff-only (migration 024) | `R` | `CHECK_MIGRATION_024` |
| `crews.rls.test.ts` | `crews` + `crew_members` are staff-only in the caller's own city — rosters name staff, so unlike `city_teams` there is no public read (030) | `R` | `CHECK_MIGRATION_030`, `CHECK_MIGRATION_012` |
| `crew-types.rls.test.ts` | `crew_types` catalog mirrors crews: staff-only read scoped to city, staff-only write (031) | `R` | `CHECK_MIGRATION_031`, `CHECK_MIGRATION_030` |
| `org-units.rls.test.ts` | `org_units` staff-only — they expose org structure *and* contractor pricing (042) | `R` | `CHECK_MIGRATION_042`, `CHECK_MIGRATION_030` |
| `routing-zones.rls.test.ts` | `routing_zones` public-read (routing config isn't sensitive) but staff-only write, scoped to city; `resolve_zone_team` (033) | `R` | `CHECK_MIGRATION_033` |
| `cross-jurisdiction.rls.test.ts` | cross-jurisdiction routing policies + RPC existence (034) | `R` | `CHECK_MIGRATION_034` |
| `loop-and-keys.rls.test.ts` | `report_updates`, `report_csat` (025), `report_upvotes`, `issue_types` (027), `api_keys` (028) | `R` | `CHECK_MIGRATIONS_025_028` |
| `video-pipeline.rls.test.ts` | every video table staff-only within the staffer's own city — camera positions, GPS tracks and unblurred-frame paths; detections/clusters accept **no** authenticated writes (056) | `R` | — |
| `camera.rls.test.ts` | the **ingest** invariant (064): there is deliberately no anon/authenticated INSERT policy on `detections` or `detection_clusters`, so a leaked anon key cannot forge detections at arbitrary coordinates and, through cluster promotion, forge reports and liability claims. Also: a contractor cannot enumerate camera devices | `T` | — |
| `liability.rls.test.ts` | a contractor cannot read `capital_jobs`, `warranties`, `utility_permits`, other contractors' claims, or `report_liability` for unassigned reports (062, 063) | `T` | — |
| `rpc-grants.rls.test.ts` | EXECUTE grants on the `SECURITY DEFINER` RPCs (068). For these the grant **is** the access control — the function bypasses RLS and takes the city id as a plain argument, so anyone who can execute it reads any tenant | `T` | — |

`rpc-grants` is the one to read first if you are new here. It exists because
three definer RPCs shipped callable by `anon`: verified against the live
database on 2026-08-30, `routing_unit_load` returned 15 rows of org-unit
cost/capacity/depot data and `search_document_chunks` returned 5 chunks of city
contract and policy text, both with the anon key and no session. Migration 068
revokes them; this suite is what fails if a later migration re-grants.

The two gate families exist for historical reasons, not by design: `rls.test.ts`
predates the `SUPABASE_TEST_*` convention and its gate was left untouched, and
newer suites picked one or the other. Export all of the variables below to run
everything against one database.

## Known expected failure — T1.13

`storage-and-cross-user.rls.test.ts` asserts that an authenticated user **cannot**
INSERT a storage object into another city's folder. Against the **current**
schema this test **FAILS**, because
`supabase/migrations/20260527_003_storage_rls_and_fixes.sql` grants INSERT with
only:

```sql
WITH CHECK (bucket_id = 'photos-public')   -- and the same for photos-raw
```

There is no constraint tying the object path to the uploader's city. The test is
the regression guard for that gap: it should stay red until a migration tightens
the policy, e.g.

```sql
WITH CHECK (
  bucket_id = 'photos-public'
  AND (storage.foldername(name))[1] = current_user_city_id()::text
)
```

after which the test goes green. Do not "fix" the test by weakening the
assertion.

## Run locally against `supabase start`

Requires the Supabase CLI and Docker.

```bash
# 1. Boot the local stack (applies supabase/migrations/*).
supabase start

# 2. Grab the local URL + keys the CLI prints (or `supabase status`):
#      API URL:        http://127.0.0.1:54321
#      anon key:       eyJ...        (SUPABASE_TEST_ANON_KEY)
#      service_role:   eyJ...        (SUPABASE_SERVICE_ROLE_KEY)

# 3a. Run the NEW suite (SUPABASE_TEST_* gate):
SUPABASE_TEST_URL="http://127.0.0.1:54321" \
SUPABASE_TEST_ANON_KEY="<anon key>" \
SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
pnpm vitest run tests/rls/storage-and-cross-user.rls.test.ts

# 3b. Run the PRE-EXISTING suite (RUN_RLS_TESTS gate):
pnpm test:rls   # sets RUN_RLS_TESTS=1, reads .env.local

# 3c. Run EVERYTHING in tests/rls against the local DB in one go:
RUN_RLS_TESTS=1 \
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>" \
SUPABASE_TEST_URL="http://127.0.0.1:54321" \
SUPABASE_TEST_ANON_KEY="<anon key>" \
SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
pnpm vitest run tests/rls
```

> On Windows PowerShell, set the vars with `$env:NAME="..."` on separate lines
> before the `pnpm vitest run ...` call rather than the inline `NAME=... cmd`
> prefix form shown above.

The new suite provisions its own fixtures (two cities, two auth users + their
`public.users` rows) via the service-role key and tears them down in
`afterAll`. It requires the `photos-public` storage bucket to exist (created by
the app's normal setup); if it is absent, the storage control test will error —
create the bucket first.

## CI

`.github/workflows/test.yml` runs `pnpm test` (which collects these) on every PR
and push. It passes the secrets `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
and `SUPABASE_TEST_SERVICE_ROLE_KEY` as env. When those secrets are unset the
`skipIf` guards fire and the suites pass-as-skipped, so the gate is green
without any database configured. Populate the secrets (pointing at a disposable
test project) to make CI actually exercise the policies.
