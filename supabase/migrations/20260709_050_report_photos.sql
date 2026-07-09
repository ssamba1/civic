-- =============================================================================
-- Migration: 20260709_050_report_photos.sql
-- Multi-photo child table for reports (#18).
--
-- Design: backward-compatible. reports.photo_public_url / photo_raw_url /
-- photo_phash / blur_version remain the PRIMARY (idx 0) photo so all existing
-- display sites keep working unchanged. report_photos stores the full set
-- (including the primary at idx 0). Single-photo submissions still work.
-- =============================================================================

CREATE TABLE report_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid        NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  idx          int         NOT NULL,          -- 0-based; idx 0 mirrors the primary
  public_url   text        NOT NULL,          -- URL in photos-public bucket (blurred)
  raw_url      text,                          -- path in photos-raw bucket (original)
  phash        text,                          -- 16-char aHash computed client-side
  blur_version int,                           -- blur pipeline version that ran
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, idx)
);

-- Index for the common "give me all photos for this report" query
CREATE INDEX idx_report_photos_report_id ON report_photos (report_id, idx);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Default deny — policies below define all permitted access.
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

-- SELECT: mirror reports visibility.
-- A photo is visible if and only if the reporter's parent report is visible to
-- the caller (same predicate as reports_select_own + reports_select_staff).
-- We use a subquery rather than a join so new report SELECT policies added
-- later automatically apply here — the mirror stays accurate without touching
-- this migration.
CREATE POLICY report_photos_select ON report_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_photos.report_id
        AND (
          -- reporter sees their own photos
          r.reporter_id = auth.uid()
          OR
          -- staff sees photos in their city
          (is_staff() AND r.city_id = current_user_city_id())
        )
    )
  );

-- INSERT: only the report's own reporter (or service role, which bypasses RLS).
-- Service role is used in the server action upload path (same pattern as the
-- existing storage uploads). Reporter must be the authenticated user.
CREATE POLICY report_photos_insert ON report_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_photos.report_id
        AND r.reporter_id = auth.uid()
    )
  );
