-- =============================================================================
-- Civic – Resident Notifications
-- Migration: 20260528_006_resident_notifications.sql
--
-- Production schema for resident-facing notifications. Each resident receives a
-- notification when one of their reports changes status, and (eventually) for
-- comments and city announcements.
--
-- NOTE: the resident UI (src/lib/resident-data.ts → getResidentNotifications)
-- currently reads SYNTHESIZED notifications derived on the fly from report
-- state. This migration lays the real-path groundwork so the UI can later read
-- persisted rows from public.notifications instead. No UI change ships here.
--
-- Re-runnable: enum guarded with DO/IF NOT EXISTS, CREATE TABLE/INDEX IF NOT
-- EXISTS, CREATE OR REPLACE for functions, drop-then-create for policies and
-- triggers, and a guarded publication ADD.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enum type
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'status_change',
      'resolved',
      'comment',
      'announcement'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. notifications table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  report_id   uuid REFERENCES reports (id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       text NOT NULL,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
-- Primary feed query: a user's notifications, newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Unread badge / count: partial index over the small set of unread rows.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- A resident can read only their own notifications.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- A resident can mark their own notifications read (and only their own).
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Status-change notification trigger
--    Fires on reports AFTER UPDATE OF status. When the status actually
--    changes, inserts a notification for the report's reporter. SECURITY
--    DEFINER so the insert bypasses the notifications INSERT-policy (residents
--    have no INSERT policy — only the system creates notifications).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_report_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  n_type  notification_type;
  n_title text;
  n_body  text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'closed' THEN
      n_type  := 'resolved';
      n_title := 'Your report was resolved';
      n_body  := 'Great news — the issue you reported has been marked resolved. Thanks for helping improve your city.';
    ELSE
      n_type  := 'status_change';
      n_title := 'Your report status changed';
      n_body  := format('Your report moved from %s to %s.', OLD.status, NEW.status);
    END IF;

    INSERT INTO public.notifications (user_id, report_id, type, title, body)
    VALUES (NEW.reporter_id, NEW.id, n_type, n_title, n_body);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_notify_status ON reports;
CREATE TRIGGER trg_reports_notify_status
  AFTER UPDATE OF status ON reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_report_status_change();

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

COMMIT;
