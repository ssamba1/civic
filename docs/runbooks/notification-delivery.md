# Runbook: resident notification delivery (email)

**Code:** `src/lib/notify/status-notify.ts` (builds the message) +
`src/lib/notify/deliver.ts` (sends via Resend) · migration 025 adds
`notifications.delivered_at` / `delivery_error`.

## How it works today

On a report status change the status-notify path builds a notification row and
calls `deliverEmail()` **inline** (no queue). Delivery uses Resend; the outcome
is recorded on the `notifications` row:
- success → `delivered_at` set,
- failure → `delivery_error` set (the row stays for retry/inspection).

## Required env

Delivery is dark until these are set in the server env:
- `RESEND_API_KEY`: Resend API key.
- `NOTIFY_FROM_EMAIL`: verified From address.
- `NEXT_PUBLIC_SITE_URL`: base URL for the tokenized status-page links.

With any unset, `deliverEmail()` no-ops/records an error and the app continues
(the status change itself never fails on a delivery problem).

## Inspecting failures

```sql
select id, report_id, delivery_error, created_at
from notifications
where delivery_error is not null
order by created_at desc
limit 50;
```

## Retry / drain

`POST /api/admin/notify-drain` (`src/lib/notify/outbox.ts` → `drainUndelivered`)
re-sends the email leg for **resolution** notifications that never landed.
`type = 'resolved' AND delivered_at IS NULL`, past a 60 s grace window (so an
in-flight synchronous send isn't double-fired). For each it re-runs
`notifyReportStatus(report_id, 'closed')`, which re-stamps the row on the way out.

Only `resolved` rows are drained: the DB trigger tags every other transition
`status_change`, which can't be pinned to a single report status, so
dispatched/rejected emails are best-effort, inline-only. The resolution email
(photo + CSAT) is the one worth never losing.

Idempotency: a delivered row (`delivered_at` set) is never re-selected; a
terminally-failed row (`no-recipient`/`disabled`/`no-key`) is stamped
`delivered_at` on its first pass and also drops out. Only a transient
`send-error` (Resend 5xx / network) stays `delivered_at IS NULL` for retry.

**Auth** (mirrors sla-escalate): `Authorization: Bearer $NOTIFY_CRON_SECRET`
for a headless timer, OR a staff/admin session for a manual flush.

```
# cron / systemd timer, every ~10 min
curl -fsS -X POST https://<host>/api/admin/notify-drain \
  -H "Authorization: Bearer $NOTIFY_CRON_SECRET"
# → {"scanned":N,"delivered":N,"stillFailing":N,"migrated":true}
```

`migrated:false` in the response means migration 025 isn't applied (the
`delivered_at` column is missing), the drain no-ops rather than erroring.

## CSAT

The resolution email carries tokenized 👍/👎 links to `/r/[token]`; taps persist
to `report_csat`. No env beyond the above.
