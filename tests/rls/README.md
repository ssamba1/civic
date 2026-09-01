# RLS regression tests

Row-Level-Security regression tests for the Civic Postgres schema. These enforce
`AGENTS.md` hard rule #3, *"RLS on every table. Default deny. Tests in
`tests/rls/` must pass before merging schema changes."*

They are **integration** tests: they run against a real Supabase/Postgres
instance, hitting it with the anon key (RLS enforced) and the service-role key
(RLS bypassing). They are **opt-in**, the default `pnpm test` still collects
them, but each suite stays in `skipIf` skip mode (and passes) unless a test
database is configured. This keeps the everyday unit run hermetic and offline,
and keeps CI green with no secrets.

## Files

| File | Covers | Gating env |
| --- | --- | --- |
| `rls.test.ts` | anon default-deny on `reports`/`classifications`/`work_orders`/`merges`/`audit_log`/`error_log`; anon can read `dashboard_reports_view`; anon cannot INSERT a report; **service-role bypass control**; (optional) migration-012 view exclusion | `RUN_RLS_TESTS=1` + `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` |
| `storage-and-cross-user.rls.test.ts` | **cross-user read isolation** (a resident can't read another's report); **storage cross-folder INSERT (T1.13)**. A city-A user can't upload into city-B's folder; plus own-report/own-city controls | `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` |

The two files use different env-var names on purpose: `rls.test.ts` predates this
work and its gate is left untouched. The newer file uses the `SUPABASE_TEST_*`
names. To run *both* against the same DB, export all of the variables below.

## Known expected failure: T1.13

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
the app's normal setup); if it is absent, the storage control test will error,
create the bucket first.

## CI

`.github/workflows/test.yml` runs `pnpm test` (which collects these) on every PR
and push. It passes the secrets `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
and `SUPABASE_TEST_SERVICE_ROLE_KEY` as env. When those secrets are unset the
`skipIf` guards fire and the suites pass-as-skipped, so the gate is green
without any database configured. Populate the secrets (pointing at a disposable
test project) to make CI actually exercise the policies.
