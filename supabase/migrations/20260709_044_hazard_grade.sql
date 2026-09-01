-- 044 hazard grading columns on reports (OUTFLANK #27)
--
-- Adds nullable hazard_severity + hazard_rationale to reports so the
-- classify pipeline can stamp the AI-derived hazard grade without a JOIN.
-- Columns are nullable: pre-graded reports (created before this migration)
-- or any report where gradeHazard() fails gracefully will have NULLs.
--
-- RLS: inherits reports table policies unchanged. No new policies needed.
-- The classify pipeline writes these via the service-role client (same as
-- all other pipeline writes), so the existing service_role bypass applies.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS hazard_severity text
    CHECK (hazard_severity IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS hazard_rationale text;

COMMENT ON COLUMN reports.hazard_severity IS
  'AI-derived hazard grade: low | medium | high | critical. NULL until gradeHazard() runs (migration 044 / OUTFLANK #27).';

COMMENT ON COLUMN reports.hazard_rationale IS
  'One-sentence Gemini rationale for hazard_severity. NULL until gradeHazard() runs.';

-- Index for priority-sorted staff inboxes that filter on hazard level.
CREATE INDEX IF NOT EXISTS idx_reports_hazard_severity
  ON reports (hazard_severity)
  WHERE hazard_severity IS NOT NULL;
