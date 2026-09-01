-- =============================================================================
-- Civic, SLA due dates + overdue escalation (LCP-16)
-- Migration: 20260708_032_sla_due_dates.sql
--
-- The sla_targets table (per-city hours-to-resolution, migration 024) already
-- exists but nothing stamped a concrete deadline onto a work order. This adds:
--   1. work_orders.due_at, deadline stamped at creation from the city's
--                                sla_targets (category → hours), created_at + N.
--   2. work_orders.escalated_at. Set once when the overdue-escalation job first
--                                acts on a breached, still-open work order, so
--                                the job is idempotent (never double-escalates).
--   3. Partial index over open work orders by due_at. The escalation scan
--                                (`/api/admin/sla-escalate`) reads exactly this.
--   4. Backfill of due_at for existing open work orders that have a matching
--                                sla_targets row.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS due_at       timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

-- The escalation job scans open (not-yet-completed) work orders whose deadline
-- has passed. Partial index keeps that scan cheap as the closed archive grows.
CREATE INDEX IF NOT EXISTS idx_work_orders_due_open
  ON work_orders (due_at)
  WHERE completed_at IS NULL;

-- Backfill: for open work orders with no deadline yet, derive it from the
-- report's category and the city's sla_targets. Rows in cities that haven't
-- seeded sla_targets stay NULL. The read/escalation paths fall back to the
-- static CATEGORY_SLA_TARGETS map, so a NULL due_at is never a hard gap.
UPDATE work_orders wo
SET due_at = wo.created_at + (st.hours * interval '1 hour')
FROM reports r
JOIN classifications c ON c.report_id = r.id
JOIN sla_targets st ON st.city_id = r.city_id AND st.category = c.category
WHERE wo.report_id = r.id
  AND wo.due_at IS NULL
  AND wo.completed_at IS NULL;

COMMIT;
