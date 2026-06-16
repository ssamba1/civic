-- 016_report_events: append-only lifecycle event log for every report.
--
-- DB triggers auto-insert rows as reports move through the pipeline —
-- no app code change needed. A one-time backfill at the bottom seeds all
-- historical data from existing tables so the events table is complete
-- from day one, even on databases that existed before this migration.
--
-- Event types emitted:
--   report_created           INSERT on reports
--   status_<new>             UPDATE reports.status  (e.g. status_dispatched)
--   ai_classified            INSERT on classifications (confidence > 0)
--   classification_failed    INSERT on classifications (confidence = 0)
--   work_order_created       INSERT on work_orders
--   dispatched               work_orders.dispatched_at set
--   resolved                 work_orders.completed_at set
--   duplicate_detected       INSERT on merges
--   classification_overridden INSERT on classification_feedback

CREATE TABLE IF NOT EXISTS report_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  actor_type  text        CHECK (actor_type IN ('resident', 'staff', 'system')),
  actor_id    uuid,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_events_report_id_idx  ON report_events(report_id);
CREATE INDEX IF NOT EXISTS report_events_event_type_idx ON report_events(event_type);
CREATE INDEX IF NOT EXISTS report_events_created_at_idx ON report_events(created_at);

ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;

-- Authenticated staff can read all events (needed for impact metrics queries)
CREATE POLICY "staff_select" ON report_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('staff_dispatcher', 'staff_supervisor', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- All functions run SECURITY DEFINER so they can INSERT without RLS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_report_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO report_events(report_id, event_type, actor_type, actor_id, metadata)
  VALUES (
    NEW.id, 'report_created', 'resident', NEW.reporter_id,
    jsonb_build_object(
      'city_id',         NEW.city_id,
      'has_description', (NEW.description IS NOT NULL)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_created
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION _evt_report_created();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_report_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO report_events(report_id, event_type, actor_type, metadata)
    VALUES (
      NEW.id,
      'status_' || NEW.status::text,
      'system',
      jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_status_changed
  AFTER UPDATE OF status ON reports
  FOR EACH ROW EXECUTE FUNCTION _evt_report_status_changed();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_classification_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO report_events(report_id, event_type, actor_type, metadata)
  VALUES (
    NEW.report_id,
    CASE WHEN COALESCE(NEW.confidence, 0) = 0
         THEN 'classification_failed'
         ELSE 'ai_classified'
    END,
    'system',
    jsonb_build_object(
      'category',     NEW.category::text,
      'severity',     NEW.severity,
      'confidence',   NEW.confidence,
      'is_emergency', NEW.is_emergency
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_classification_created
  AFTER INSERT ON classifications
  FOR EACH ROW EXECUTE FUNCTION _evt_classification_created();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_work_order_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO report_events(report_id, event_type, actor_type, metadata)
  VALUES (
    NEW.report_id, 'work_order_created', 'system',
    jsonb_build_object(
      'department',    NEW.department::text,
      'priority_score', NEW.priority_score,
      'wo_source',     NEW.wo_source
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_order_created
  AFTER INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION _evt_work_order_created();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_work_order_milestones()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.dispatched_at IS NOT NULL AND OLD.dispatched_at IS NULL THEN
    INSERT INTO report_events(report_id, event_type, actor_type, metadata)
    VALUES (
      NEW.report_id, 'dispatched', 'staff',
      jsonb_build_object('department', NEW.department::text, 'crew_type', NEW.crew_type)
    );
  END IF;
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    INSERT INTO report_events(report_id, event_type, actor_type, metadata)
    VALUES (
      NEW.report_id, 'resolved', 'staff',
      jsonb_build_object('department', NEW.department::text)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_order_milestones
  AFTER UPDATE OF dispatched_at, completed_at ON work_orders
  FOR EACH ROW EXECUTE FUNCTION _evt_work_order_milestones();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_merge_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO report_events(report_id, event_type, actor_type, metadata)
  VALUES (
    NEW.duplicate_report_id, 'duplicate_detected', 'system',
    jsonb_build_object(
      'primary_report_id', NEW.primary_report_id,
      'similarity_score',  NEW.similarity_score
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_merge_created
  AFTER INSERT ON merges
  FOR EACH ROW EXECUTE FUNCTION _evt_merge_created();

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _evt_classification_overridden()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO report_events(report_id, event_type, actor_type, actor_id, metadata)
  VALUES (
    NEW.report_id, 'classification_overridden', 'staff', NEW.staff_id,
    jsonb_build_object(
      'from', NEW.original_category::text,
      'to',   NEW.corrected_category::text
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_classification_overridden
  AFTER INSERT ON classification_feedback
  FOR EACH ROW EXECUTE FUNCTION _evt_classification_overridden();

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: reconstruct events from all existing table data.
-- Rows are tagged backfilled=true so they can be identified if needed.
-- ON CONFLICT DO NOTHING would require a unique key; since we have none,
-- this migration is safe to run once per database — re-running it would
-- duplicate rows. Supabase migrations run exactly once, so this is fine.
-- ─────────────────────────────────────────────────────────────────────────────

-- report_created
INSERT INTO report_events(report_id, event_type, actor_type, actor_id, metadata, created_at)
SELECT
  id, 'report_created', 'resident', reporter_id,
  jsonb_build_object('city_id', city_id, 'has_description', (description IS NOT NULL), 'backfilled', true),
  created_at
FROM reports;

-- ai_classified / classification_failed
INSERT INTO report_events(report_id, event_type, actor_type, metadata, created_at)
SELECT
  report_id,
  CASE WHEN COALESCE(confidence, 0) = 0 THEN 'classification_failed' ELSE 'ai_classified' END,
  'system',
  jsonb_build_object('category', category::text, 'confidence', confidence, 'severity', severity, 'backfilled', true),
  created_at
FROM classifications;

-- work_order_created
INSERT INTO report_events(report_id, event_type, actor_type, metadata, created_at)
SELECT
  report_id, 'work_order_created', 'system',
  jsonb_build_object('department', department::text, 'wo_source', wo_source, 'backfilled', true),
  created_at
FROM work_orders;

-- dispatched
INSERT INTO report_events(report_id, event_type, actor_type, metadata, created_at)
SELECT
  report_id, 'dispatched', 'staff',
  jsonb_build_object('department', department::text, 'backfilled', true),
  dispatched_at
FROM work_orders
WHERE dispatched_at IS NOT NULL;

-- resolved
INSERT INTO report_events(report_id, event_type, actor_type, metadata, created_at)
SELECT
  report_id, 'resolved', 'staff',
  jsonb_build_object('department', department::text, 'backfilled', true),
  completed_at
FROM work_orders
WHERE completed_at IS NOT NULL;

-- duplicate_detected
INSERT INTO report_events(report_id, event_type, actor_type, metadata, created_at)
SELECT
  duplicate_report_id, 'duplicate_detected', 'system',
  jsonb_build_object('primary_report_id', primary_report_id, 'similarity_score', similarity_score, 'backfilled', true),
  created_at
FROM merges;

-- classification_overridden
INSERT INTO report_events(report_id, event_type, actor_type, actor_id, metadata, created_at)
SELECT
  report_id, 'classification_overridden', 'staff', staff_id,
  jsonb_build_object('from', original_category::text, 'to', corrected_category::text, 'backfilled', true),
  created_at
FROM classification_feedback;
