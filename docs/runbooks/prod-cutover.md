# Runbook — DEMO_MODE → production cutover

Many features gate on `DEMO_MODE` (localStorage / synthetic corpus) and no-op
their DB writes when it's on: upvotes, category routing, custom categories,
CSAT, notification email. A live pilot needs a deliberate, verified flip — not
ad-hoc env edits. This is the checklist.

## 0. Preconditions

- A provisioned Supabase project (Postgres 15 + PostGIS) with the service-role
  key in hand.
- Two storage buckets exist: `photos-public` (blurred, permanent) and
  `photos-raw` (originals, 30-day TTL, restricted RLS). See `agents.md` hard
  rule 2.

## 1. Apply migrations

Migrations are **not** auto-applied. Run the whole `supabase/migrations/`
directory in filesystem order (dates make the order deterministic — the two
`_023_` files carry different date prefixes and sort correctly):

```
DATABASE_URL='postgresql://…' node scripts/run-migrations.mjs
# → each file "OK"; exits non-zero if any FAILed
```

This lands 024–034: `city_config`, `close_the_loop` (report_updates, report_csat,
public_token, notifications.delivered_at), `team_routing` (work_orders.team_key),
`upvotes_issue_types`, `api_keys`, crews, SLA due dates, routing zones,
cross-jurisdiction.

## 2. Environment

Set in the server env (never `NEXT_PUBLIC_*` for secrets):

| Var | Purpose | Feature it unblocks |
|-----|---------|--------------------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | service-role DB | all DB writes |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth | anon sessions, upvotes |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | email delivery | resolution / dispatch emails |
| `NEXT_PUBLIC_SITE_URL` | tokenized status-page links | `/r/[token]` in emails, CSAT |
| `NOTIFY_CRON_SECRET` | drain auth | `POST /api/admin/notify-drain` |
| `SLA_CRON_SECRET` | escalation auth | `POST /api/admin/sla-escalate` |
| `GEMINI_API_KEY` (`@ai-sdk/google`) | classification | `/api/ai/*` |
| `OPEN311_SYSTEM_USER_ID` | legacy attribution | Open311 POST fallback |

Ensure `DEMO_MODE` is **off** and `NOTIFY_DISABLE` is unset. With `DEMO_MODE`
off, the fire-and-forget DB legs in `lib/upvotes.ts`, `lib/category-overrides.ts`,
and `lib/custom-categories.ts` begin persisting.

## 3. Seed

```
pnpm db:seed        # Cumming + test data (tsx supabase/seed/index.ts)
```

## 4. Schedule the drains

Two idempotent, admin-gated endpoints want a timer (systemd / external cron):

```
*/10 * * * *  curl -fsS -X POST $HOST/api/admin/notify-drain -H "Authorization: Bearer $NOTIFY_CRON_SECRET"
*/15 * * * *  curl -fsS -X POST $HOST/api/admin/sla-escalate  -H "Authorization: Bearer $SLA_CRON_SECRET"
```

See `notification-delivery.md` and `sla-escalate.md`.

## 5. Verify

```
pnpm health          # db + gemini green
pnpm audit:privacy   # no raw photos in photos-public
```

Then one **manual end-to-end on a real phone** against the live DB:
1. `/report` — submit a photo from a clean session (anonymous). Confirms the
   anon session + `ensureResidentProfile` self-heal (so the close email can fire).
2. Staff dispatch → close with actual cost + resolution photo.
3. Resident receives the resolution email (check `notifications.delivered_at` is
   set); tap 👍/👎 → confirm a `report_csat` row.
4. Upvote a report on the public map; reload → count persists (`report_upvotes`).
5. Re-route a category in the routing matrix; file a matching report → the work
   order's `team_key` reflects the override.

This single pass validates migrations, notification drain, CSAT, upvotes, and
DB-backed routing together.

## Rollback

Cutover is additive (new columns/tables, `IF NOT EXISTS`) — no destructive
migration. To fall back to demo, set `DEMO_MODE` on again; the DB rows remain but
the UI reverts to the synthetic corpus. Revoke any issued Open311 keys via
`/admin/api-keys` if the pilot is aborted.
