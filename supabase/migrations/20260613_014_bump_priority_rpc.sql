-- =============================================================================
-- Civic – Escalate work-order priority on duplicate
-- Migration: 20260613_014_bump_priority_rpc.sql
--
-- Connects two pieces that already existed but were never wired together:
--   - generateWorkOrder's priority formula has a `recurrence` term, but the
--     pipeline always passed recurrenceCount = 0.
--   - dedup (migration 011) detects when a new report duplicates an earlier
--     primary, then threw that signal away.
--
-- Now, when a duplicate is merged into a primary, the primary's work order
-- priority is bumped atomically — a pothole reported five times outranks one
-- reported once. This is the real demand signal staff want for triage.
--
-- Atomic (priority_score = priority_score + delta in one statement) so two
-- duplicates merging concurrently both count, with no read-modify-write race.
-- No-op when the primary has no work order yet (e.g. it was an emergency).
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Re-runnable: CREATE OR REPLACE FUNCTION.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bump_work_order_priority(
  _report_id uuid,
  _delta     numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE work_orders
  SET priority_score = priority_score + _delta
  WHERE report_id = _report_id
  RETURNING priority_score;
$$;

-- Pipeline calls this via the service-role client; grant authenticated too for
-- any staff-side escalation tooling.
GRANT EXECUTE ON FUNCTION public.bump_work_order_priority(uuid, numeric)
  TO authenticated, service_role;

COMMIT;
