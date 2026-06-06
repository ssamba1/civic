-- =============================================================================
-- Civic – AI Pipeline
-- Migration: 20260529_007_ai_pipeline.sql
--
-- Additive, safe, idempotent groundwork for the OPTIONAL async-classify path.
-- The synchronous classify pipeline (the default demo path) is unaffected by
-- this migration — it adds a single nullable status column used only when the
-- async background-classify path is enabled via NEXT_PUBLIC_ASYNC_CLASSIFY=1.
--
-- NOTE: this migration is NOT auto-applied. Run it explicitly with
--   npm run db:migrate
-- when enabling the async-classify path. Until then it is inert.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS + idempotent partial index. Safe to
-- run multiple times; no data is mutated and no existing behavior changes.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. classify_status column
--    Tracks the lifecycle of an async classification job for a report.
--    null    — async classification never enqueued (the synchronous default)
--    pending — job enqueued, awaiting / mid-flight Gemini call
--    done    — classification + work order persisted successfully
--    failed  — classification failed; report remains in the manual triage queue
-- ---------------------------------------------------------------------------
ALTER TABLE reports ADD COLUMN IF NOT EXISTS classify_status text;

COMMENT ON COLUMN reports.classify_status IS 'null|pending|done|failed — only used when NEXT_PUBLIC_ASYNC_CLASSIFY=1';

-- ---------------------------------------------------------------------------
-- 2. Worker dequeue index
--    Partial index over the small set of in-flight rows so the async worker
--    can cheaply find work (status = pending) without scanning the whole table.
--    Inert when async is OFF (no rows ever carry a non-null status).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_classify_status
  ON reports (classify_status)
  WHERE classify_status IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Realtime
--    The resident report page subscribes to classifications INSERTs to fill in
--    the confirmation UI when the background async-classify job lands. The
--    INSERT payload carries the full classification, so one subscription needs
--    no follow-up fetch. RLS (classifications_select_own) authorizes the
--    reporter. Guarded + idempotent; inert when async is OFF (the resident page
--    never subscribes unless NEXT_PUBLIC_ASYNC_CLASSIFY=1).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'classifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classifications;
  END IF;
END
$$;

COMMIT;
