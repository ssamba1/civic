# Runbook — SLA overdue escalation

**Endpoint:** `POST /api/admin/sla-escalate`
**Code:** `src/app/api/admin/sla-escalate/route.ts` · ADR 0004 · migration 032

## What it does

Scans open (`completed_at IS NULL`), overdue (`due_at < now`), not-yet-escalated
(`escalated_at IS NULL`) work orders. For each still-in-backlog report it:
1. appends a `system` note to `report_updates` ("SLA breached … auto-escalated"),
2. bumps `priority_score` by 25 (floats it up the grid),
3. stamps `escalated_at = now` (so a re-run never double-escalates).

Reports already closed/rejected/merged are marked `escalated_at` and skipped.
Returns `{ escalated, skipped, migrated }`. On an un-migrated DB (`due_at` absent)
it returns `{ migrated: false }` and does nothing — safe to call anywhere.

## How to invoke

**Headless (cron / systemd timer):** set `SLA_CRON_SECRET` in the server env and
send the bearer:
```
curl -X POST https://<host>/api/admin/sla-escalate \
  -H "authorization: Bearer $SLA_CRON_SECRET"
```
Suggested cadence: every 15–30 min. Example systemd timer or crontab:
```
*/15 * * * * curl -fsS -X POST https://<host>/api/admin/sla-escalate -H "authorization: Bearer $SLA_CRON_SECRET" >/dev/null
```

**Manual (staff/admin):** a logged-in staff session may POST it from the app
without the bearer.

## Auth + limits

- Cron bearer OR staff/admin session (`staff_dispatcher|staff_supervisor|admin`).
- IP rate-limited to 10/min. `DEV_AUTH_BYPASS=1` skips auth in dev only.

## Secret rotation

Rotate `SLA_CRON_SECRET`: set the new value in the server env, update the
cron/timer's `authorization` header, deploy. No DB change. Old secret stops
working immediately on deploy.

## Idempotency + recovery

`escalated_at` makes the scan idempotent. To re-escalate a specific work order
(e.g. after a false skip), clear it: `UPDATE work_orders SET escalated_at = NULL
WHERE id = '<id>'` then re-run. There is no bulk un-escalate by design.
