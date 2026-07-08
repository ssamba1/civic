# Runbook — resident notification delivery (email)

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
- `RESEND_API_KEY` — Resend API key.
- `NOTIFY_FROM_EMAIL` — verified From address.
- `NEXT_PUBLIC_SITE_URL` — base URL for the tokenized status-page links.

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

## Retry / drain (current state)

There is **no `/api/admin/notify-drain` endpoint yet** — delivery is inline-only.
Failed rows persist with `delivery_error` for manual inspection. When volume
justifies it, the planned drain is an admin-gated `POST /api/admin/notify-drain`
that re-sends rows where `delivered_at IS NULL AND delivery_error IS NOT NULL`,
driven by a cron/timer (mirror the sla-escalate auth + rate-limit pattern). Until
then, to re-send after fixing env, clear the error and re-trigger the status
change, or send manually via Resend.

## CSAT

The resolution email carries tokenized 👍/👎 links to `/r/[token]`; taps persist
to `report_csat`. No env beyond the above.
