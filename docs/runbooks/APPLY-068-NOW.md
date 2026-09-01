# Apply migration 068 — live anon-readable RPC

**Status: NOT APPLIED. Verified still exploitable on 2026-09-01.**

`routing_unit_load(uuid)` is `SECURITY DEFINER` and executable by `PUBLIC`.
Anyone holding the **anon key** — which ships in every browser bundle — can
call it for **any city id** and read that city's org chart operating data:
per-unit capacity, `cost_per_job`, SLA hours, skills, depot coordinates and
open work-order load.

Reproduced against the live project minutes before this file was written:

```
routing_unit_load(_city_id) with the anon key  ->  ALLOWED, 15 rows
```

This repository is public and `supabase/migrations/20260830_068_rpc_grants_and_fk_indexes.sql`
describes the hole in detail, so it is disclosed and unpatched at the same time.
That is the part that makes it urgent rather than merely untidy.

## Fastest fix — Supabase SQL editor, ~60 seconds

Open the project's SQL editor and run:

```sql
REVOKE EXECUTE ON FUNCTION public.routing_unit_load(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.routing_unit_load(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.find_nearby_detection_cluster(uuid, float8, float8, text, float8)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.find_nearby_detection_cluster(uuid, float8, float8, text, float8) TO service_role;

CREATE INDEX IF NOT EXISTS idx_routing_decisions_report ON public.routing_decisions (report_id);
CREATE INDEX IF NOT EXISTS idx_routing_events_work_order ON public.routing_events (work_order_id);
```

## Or via the CLI

The saved access token is expired (`supabase projects list` returns
`Unauthorized`), so this needs a fresh login first:

```bash
npx supabase login
npx supabase link --project-ref gisoowyezwhdrozettbg
pnpm db:migrate
```

## Why it is safe to apply

Only `REVOKE` and `CREATE INDEX IF NOT EXISTS` — nothing is created or dropped,
and it is idempotent. Every caller in the codebase already uses the
service-role client, verified independently rather than taken from the
migration's own header:

| Function | Caller | Client |
|---|---|---|
| `routing_unit_load` | none in `src/` at all | — |
| `search_document_chunks` | `src/lib/documents/retrieve.ts` | `server-only`, `createServerClient` |
| `find_nearby_detection_cluster` | `src/lib/video/pipeline.ts` | `createServerClient` |

No client path loses access.

## Verify afterwards

```js
// with the ANON key only
const { error } = await anon.rpc("routing_unit_load", { _city_id: "<any city uuid>" });
// expected: error, "permission denied for function routing_unit_load"
```

The rest of the tenancy posture is already correct — an anon `select *` against
`users`, `reports`, `classifications`, `work_orders`, `crews`, `crew_members`,
`api_keys`, `error_log`, `org_units`, `report_photos`, `merges`, `notifications`
and `audit_log` all return **0 rows**. `city_teams` returns 39, which is the
public division labels the dashboard renders.
