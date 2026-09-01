# 0004: SLA due dates + overdue escalation

- Status: **Accepted** (2026-07-08)
- Scope: how work orders acquire a deadline and how breaches surface.

## Context

Per-city `sla_targets` (hours-to-resolution by category, migration 024) existed
but nothing stamped a concrete deadline onto a work order, and nothing acted on
a breach. Operators had no "what's overdue" signal beyond eyeballing ages.

## Decision

- Migration 032 adds `work_orders.due_at` (stamped at creation) + `escalated_at`
  (idempotency guard) + a partial index over open work orders by `due_at`.
- The classify pipeline stamps `due_at = now + sla_hours` via a **guarded write**
  (no-op-safe on un-migrated DBs), resolving hours through
  `fetchSlaHours(city, category)` with a static `CATEGORY_SLA_TARGETS` fallback.
- `/api/admin/sla-escalate` (staff session OR `SLA_CRON_SECRET` bearer, IP
  rate-limited) scans open + overdue + un-escalated work orders, appends a
  `system` note to the report timeline, bumps priority, and stamps
  `escalated_at`. A systemd timer / external cron drives it.
- The grid's SLA column is derived **client-side** from category + created_at
  (NOT `due_at`) so it renders on un-migrated DBs, `due_at` drives the
  server-side job; the column is the operator view.

## Alternatives considered

- **DB trigger / pg_cron for escalation**: keeps logic in SQL but is harder to
  test and observe; an HTTP drain endpoint is unit/e2e-testable and portable to
  the self-hosted box.
- **Compute due_at on read only**: can't drive a one-shot escalation action
  (needs a persisted "already escalated" marker).

## Consequences

- Escalation cadence is external (cron/timer hitting the drain), documented in
  the sla-escalate runbook.
- `due_at` is stamped from the static fallback until a city seeds `sla_targets`.
