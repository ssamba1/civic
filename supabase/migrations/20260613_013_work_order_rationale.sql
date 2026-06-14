-- =============================================================================
-- Civic – Work order AI rationale
-- Migration: 20260613_013_work_order_rationale.sql
--
-- The AI work-order generator (work-order-ai.ts) returns a `rationale` string
-- explaining how it sized the crew, time, materials, and cost — the "show your
-- work" a public-works reviewer needs to trust an AI-generated cost estimate.
-- It was being discarded. This adds a nullable column to persist it.
--
-- Additive + nullable + written via the same guarded separate-update path as
-- est_cost (migration 010), so the core work_orders insert still succeeds on an
-- un-migrated database. Null on the rules fallback path (no AI rationale).
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Re-runnable: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

BEGIN;

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS wo_rationale text;

COMMENT ON COLUMN work_orders.wo_rationale IS 'AI explanation of how crew/time/materials/cost were sized; null on the rules fallback path.';

COMMIT;
