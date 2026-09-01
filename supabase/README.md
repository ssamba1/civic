# supabase/

Schema and demo data. Two subdirectories, and they have opposite rules:
`migrations/` is append-only and spec-critical, `seed/` is disposable.

```
migrations/   77 ordered SQL files — never edited once applied
seed/         demo corpora — safe to rewrite, safe to re-run
```

> `agents.md` rule 10: nothing under `supabase/migrations/` is modified without
> an explicit ask. This file documents that directory; it does not license
> editing it.

## migrations/

Applied with `pnpm db:migrate` (`supabase db push`), which orders files
**lexicographically by filename**.

### Naming

`YYYYMMDD_NNN_snake_case_description.sql`

The date prefix is what actually orders the file. The sequence number is a
human label, and the two have come apart at least once:
`20260824_056_video_pipeline.sql` carries `056`, but its date prefix places it
after `064` and before `065`. **Read the date, not the number, when you need to
know what ran before what.**

There are two `056` files for the same reason, and CI knows: the
`migrations` workflow reports duplicate sequence numbers as a *warning* rather
than a failure, because renaming an already-applied migration is the more
dangerous move — Supabase's tracking table keys on filename, so a rename makes
an applied migration look pending.

The `023b` / `036b` / `036c` / `036d` / `041b` / `057b` suffixes are follow-ups
that had to land after their parent was already applied somewhere. Use one
rather than renumbering.

### Rules

1. **Never edit an applied migration.** Write a new one. The tracking table
   keys on filename and content drift is invisible until a fresh deploy.
2. **RLS on every new table**, default deny, with a matching suite under
   `tests/rls/`. `pnpm test:rls` must pass before the schema change merges.
3. **`geography(POINT, 4326)` for locations, `timestamptz` for time.** Never
   `geometry`, never a naive timestamp. PostGIS `geography` costs more and
   handles the antimeridian correctly, which is the trade this project made.
4. **PostGIS is required from migration 1.** A plain `postgres` image fails
   immediately; CI uses `postgis/postgis:15-3.4`.
5. **Grant deliberately.** `068_rpc_grants_and_fk_indexes.sql` exists because
   three `SECURITY DEFINER` RPCs were callable by `anon`. A new definer function
   needs its grants stated, not inherited.

### The failure mode this directory has actually had

Migrations get applied incrementally against a live project, so a file can be
broken in a way nobody notices until someone stands up a *new* database — and
this repo has shipped DDL that existed live but in no migration file.

That is what `.github/workflows/migrations.yml` is for: it replays all 77 files
into an empty PostGIS database on every push touching this directory, which is
what a new city deployment does. It needs no secrets. It does **not** assert the
result matches the live project — that would need production credentials — so it
answers the narrower question, "would a fresh deploy succeed?"

If you change schema, watch that job, not just `test.yml`.

## seed/

None of this is required to run the app. It exists to make an empty database
look like a working city.

| File | What it seeds |
| --- | --- |
| `index.ts` | The base seed (`pnpm db:seed`). Cumming, GA with a boundary polygon, three test users, five reports with classifications and work orders. Idempotent — city and users upsert, reports skip on a matching (city, address). Supports `--dry-run`. |
| `synthetic_reports.sql` | 120 additional Cumming reports generated from `buildCorpus()` in `src/lib/dashboard-data.ts`. Reports and classifications only. Run the base seed first — it resolves the city and a reporter from existing rows. |
| `july_calendar_backfill.sql` | Work orders for a deterministic slice of that corpus. |
| `demo-crews.mjs` | An eight-crew roster per demo city, round-robin staffed from existing staff users, skipping crews whose division isn't enabled for that city. |
| `ahilyanagar-demo.mjs` | A second demo city (Ahilyanagar, Maharashtra) — 11 teams, ~22 reports — which is what proves the app is not hardcoded to Cumming. |

### Two traps

**The calendar looks empty after seeding.** `/city/[slug]/calendar` plots
`work_orders`, not `reports`. `synthetic_reports.sql` inserts neither work
orders nor anything the calendar reads, so 120 seeded reports produce a calendar
showing only the handful the base seed created. `july_calendar_backfill.sql` is
the fix.

**The public status page 404s after seeding.** `reports.public_token` is stamped
lazily by the notifier, the first time a resident is actually sent a link —
correct for a live city, wrong for seeded rows that are never notified. Run
`pnpm db:tokens` or every `/r/[token]` URL is dead while the rest of the app
looks complete.

`pnpm demo:seed` runs the whole sequence in order and is the path to prefer.

### Service-role warning

Every `.mjs` seed here writes through the service-role key and bypasses RLS
entirely. They are idempotent, but idempotent against the *demo* corpus —
several also reset known demo passwords. Point them at a real deployment and
they will happily seed it.
