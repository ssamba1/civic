-- =============================================================================
-- Civic. Under-Fix Estimates
-- Migration: 20260614_015_under_fix_estimates.sql
--
-- Adds admin-set, public-facing fix estimate fields to work_orders so staff
-- can mark a report as actively under fix and share cost/timeline context
-- with the resident who filed it.
--
-- All columns are nullable; existing rows and the normal dispatch/close flow
-- are completely unaffected. Re-runnable (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

BEGIN;

-- Admin-set public cost estimate (USD, whole dollars).
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS fix_cost_estimate numeric;

-- Admin-set public time estimate (calendar days to completion).
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS fix_time_estimate_days numeric;

-- Optional plain-language note shown to the resident (max enforced in app).
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS fix_note text;

-- Timestamp when staff marked the report as actively under fix.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS marked_under_fix_at timestamptz;

COMMENT ON COLUMN work_orders.fix_cost_estimate      IS 'Admin-set public cost estimate in USD for the fix.';
COMMENT ON COLUMN work_orders.fix_time_estimate_days IS 'Admin-set public timeline estimate in calendar days.';
COMMENT ON COLUMN work_orders.fix_note               IS 'Optional staff note shown to the public about the fix in progress.';
COMMENT ON COLUMN work_orders.marked_under_fix_at    IS 'When staff first marked this work order as actively under fix.';

COMMIT;
