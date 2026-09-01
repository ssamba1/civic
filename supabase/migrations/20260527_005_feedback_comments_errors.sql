-- =============================================================================
-- Civic. Classification Feedback, Work Order Comments, Error Log
-- Migration: 20260527_005_feedback_comments_errors.sql
--
-- Adds:
--   classification_feedback, records every staff override of an AI category
--   work_order_comments. Per-work-order staff thread with Realtime
--   error_log, structured server-side error capture with correlation IDs
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. classification_feedback
--    One row per staff override. original_category + corrected_category let
--    us compute per-category mismatch rates for prompt improvement.
-- ---------------------------------------------------------------------------
CREATE TABLE classification_feedback (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  staff_id            uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  original_category   classification_category NOT NULL,
  corrected_category  classification_category NOT NULL,
  original_confidence numeric CHECK (original_confidence BETWEEN 0 AND 1),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_report    ON classification_feedback (report_id);
CREATE INDEX idx_feedback_original  ON classification_feedback (original_category);
CREATE INDEX idx_feedback_corrected ON classification_feedback (corrected_category);
CREATE INDEX idx_feedback_created   ON classification_feedback (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. work_order_comments
--    Per-work-order staff thread. Subscribed to via Supabase Realtime.
-- ---------------------------------------------------------------------------
CREATE TABLE work_order_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders (id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wo_comments_work_order ON work_order_comments (work_order_id);
CREATE INDEX idx_wo_comments_created    ON work_order_comments (created_at DESC);

-- Enable Realtime replication for the comments table
ALTER PUBLICATION supabase_realtime ADD TABLE work_order_comments;

-- ---------------------------------------------------------------------------
-- 3. error_log
--    Structured server-side errors with correlation IDs.
--    Inserts come from the service role (bypasses RLS).
--    Reads are limited to supervisors/admins.
-- ---------------------------------------------------------------------------
CREATE TABLE error_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL,
  context        text NOT NULL,
  message        text NOT NULL,
  metadata       jsonb DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_log_correlation ON error_log (correlation_id);
CREATE INDEX idx_error_log_created     ON error_log (created_at DESC);
CREATE INDEX idx_error_log_context     ON error_log (context);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE classification_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log               ENABLE ROW LEVEL SECURITY;

-- Feedback: staff can read; staff can insert (must be their own staff_id)
CREATE POLICY "staff_read_feedback"
  ON classification_feedback FOR SELECT TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('staff_dispatcher', 'staff_supervisor', 'admin')
  );

CREATE POLICY "staff_insert_feedback"
  ON classification_feedback FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = staff_id
    AND (SELECT role FROM users WHERE id = auth.uid())
        IN ('staff_dispatcher', 'staff_supervisor', 'admin')
  );

-- Comments: staff can read and insert their own comments
CREATE POLICY "staff_read_comments"
  ON work_order_comments FOR SELECT TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('staff_dispatcher', 'staff_supervisor', 'admin')
  );

CREATE POLICY "staff_insert_comments"
  ON work_order_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (SELECT role FROM users WHERE id = auth.uid())
        IN ('staff_dispatcher', 'staff_supervisor', 'admin')
  );

-- Error log: supervisor/admin can read; inserts only from service role (bypasses RLS)
CREATE POLICY "supervisor_read_errors"
  ON error_log FOR SELECT TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid())
    IN ('staff_supervisor', 'admin')
  );

COMMIT;
