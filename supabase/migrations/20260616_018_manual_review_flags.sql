-- 018_manual_review_flags
--
-- Adds AI self-reported uncertainty signals to classifications, and a
-- needs_manual_review flag to work_orders so the classify pipeline can hold
-- a report for human triage instead of auto-dispatching it. A report is
-- flagged when:
--   - Gemini failed / confidence = 0 (already a fallback classification)
--   - the AI saw no actual damage/issue in the photo (no_issue_detected)
--   - the AI's confidence is below 0.5 (unsure which category/team)
--   - the AI listed alternate_categories (issue spans multiple plausible teams)
--
-- Flagged reports stay at status 'open' (never silently auto-dispatched) and
-- surface with a "Needs Review" badge in the staff inbox; staff use the
-- existing override/dispatch actions to resolve them.

ALTER TABLE classifications
  ADD COLUMN IF NOT EXISTS no_issue_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alternate_categories classification_category[] NOT NULL DEFAULT '{}';

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

CREATE INDEX IF NOT EXISTS work_orders_needs_review_idx
  ON work_orders (needs_manual_review)
  WHERE needs_manual_review = true;

-- Re-point the report_events trigger (migration 016) so a flagged work order
-- logs a distinct 'flagged_for_manual_review' event instead of the generic
-- 'work_order_created', CREATE OR REPLACE updates the existing trigger's
-- behavior in place, no need to touch the trigger itself.
CREATE OR REPLACE FUNCTION _evt_work_order_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO report_events(report_id, event_type, actor_type, metadata)
  VALUES (
    NEW.report_id,
    CASE WHEN NEW.needs_manual_review THEN 'flagged_for_manual_review' ELSE 'work_order_created' END,
    'system',
    jsonb_build_object(
      'department',          NEW.department::text,
      'priority_score',      NEW.priority_score,
      'wo_source',            NEW.wo_source,
      'needs_manual_review',  NEW.needs_manual_review,
      'review_reason',        NEW.review_reason
    )
  );
  RETURN NEW;
END;
$$;
