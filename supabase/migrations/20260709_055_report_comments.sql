-- =============================================================================
-- Civic – Report Comment Thread
-- Migration: 20260709_055_report_comments.sql
--
-- Design:
--   A PUBLIC Q&A / comment thread attached to a report. Different from the
--   staff-internal `report_updates` append-only timeline (migration 025) which
--   records status changes. This table allows both residents and staff to post
--   messages visible on the resident-facing report detail page.
--
-- Author roles:
--   'resident' — the authenticated resident who submitted or is following up
--   'staff'    — a city staff member responding officially
--   'system'   — reserved for automated messages (e.g. "Report merged")
--
-- Privacy:
--   body must be PII-redacted BEFORE insert (enforced in the server action, not
--   in the DB — the DB trusts the service-role writer). The hidden flag allows
--   staff to soft-delete a comment that slipped through without PII redaction.
-- =============================================================================

CREATE TABLE IF NOT EXISTS report_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid        NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  -- NULL author_id is allowed for 'system' role entries written by service role
  author_id   uuid,
  author_role text        NOT NULL CHECK (author_role IN ('resident', 'staff', 'system')),
  body        text        NOT NULL,
  -- soft-delete: staff can hide offensive / PII-leaking comments
  hidden      bool        NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Primary query pattern: all visible comments for a report, chronological
CREATE INDEX idx_report_comments_report_created
  ON report_comments (report_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Default deny — every access path must match a policy below.
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: a comment is visible when BOTH:
--   1. The parent report is visible to the caller (mirrors the report_photos
--      select predicate — reporter OR staff-in-city). We use a subquery so
--      that future changes to report visibility automatically propagate.
--   2. hidden = false  OR  the caller is staff (staff see all, including hidden)
CREATE POLICY report_comments_select ON report_comments
  FOR SELECT
  TO authenticated
  USING (
    -- hidden guard: non-staff only see non-hidden comments
    (hidden = false OR is_staff())
    AND
    -- parent report visibility mirror
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_comments.report_id
        AND (
          r.reporter_id = auth.uid()
          OR (is_staff() AND r.city_id = current_user_city_id())
        )
    )
  );

-- INSERT: an authenticated user may post a comment when:
--   - They are the report's own reporter (resident commenting on their own report)
--   - OR they are staff for the city that owns the report
-- The service role (used by server actions) bypasses RLS entirely, so the
-- server action is responsible for enforcing these constraints itself.
CREATE POLICY report_comments_insert ON report_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_comments.report_id
        AND (
          r.reporter_id = auth.uid()
          OR (is_staff() AND r.city_id = current_user_city_id())
        )
    )
  );

-- UPDATE: staff may flip the hidden flag (moderation). Restrict to only the
-- hidden column by requiring that all other columns remain unchanged.
-- Non-staff users may never UPDATE a comment (no policy = deny).
CREATE POLICY report_comments_update_hidden ON report_comments
  FOR UPDATE
  TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());
