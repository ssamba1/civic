-- =============================================================================
-- Civic. Reconcile live-DB schema drift
-- Migration: 20260630_021_reconcile_live_drift.sql
--
-- The deployed Supabase project (gisoowyezwhdrozettbg) was provisioned through
-- ~migration 009 plus the onboarding pair (019/020), but the column-adding
-- migrations 010/013/018 and the error_log table (005) were never applied to it.
-- That drift silently broke every live classification (the classify pipeline's
-- classifications upsert + work_orders insert wrote columns the DB lacked → the
-- whole PostgREST write 400'd → no row persisted → resident saw the no-AI
-- fallback) and the staff inbox (its embedded classifications select referenced
-- the same missing columns → 0 work orders).
--
-- This migration is the additive reconcile: it adds exactly the missing columns
-- + the error_log table, all idempotent (IF NOT EXISTS), so it is safe to run on
-- this partially-migrated DB without conflicting with already-applied objects.
-- It deliberately does NOT touch the work_order event trigger (018), that
-- depends on report_events (016) whose state on this DB is unverified, and the
-- current trigger already accepts inserts. Re-applying the formal 010-018
-- migration files instead would conflict on 019/020's non-idempotent policy.
-- =============================================================================

-- 010 (est_cost, wo_source) + 013 (wo_rationale) + 018 (manual-review flags)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS est_cost            numeric,
  ADD COLUMN IF NOT EXISTS wo_source           text,
  ADD COLUMN IF NOT EXISTS wo_rationale        text,
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason       text;

-- 018 (AI self-reported uncertainty signals)
ALTER TABLE classifications
  ADD COLUMN IF NOT EXISTS no_issue_detected    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alternate_categories classification_category[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS work_orders_needs_review_idx
  ON work_orders (needs_manual_review)
  WHERE needs_manual_review = true;

-- 005 (error_log). Structured server-side error capture; the classify pipeline
-- writes here on its failure paths. RLS-enabled, default-deny (service role
-- bypasses for the pipeline's inserts), mirroring the original 005 definition.
CREATE TABLE IF NOT EXISTS error_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL,
  context        text NOT NULL,
  message        text NOT NULL,
  metadata       jsonb DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_correlation ON error_log (correlation_id);
CREATE INDEX IF NOT EXISTS idx_error_log_created     ON error_log (created_at DESC);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
