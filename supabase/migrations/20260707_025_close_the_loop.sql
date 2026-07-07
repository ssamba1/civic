-- =============================================================================
-- Civic – Close the loop: report timeline, CSAT, live status-page tokens
-- Migration: 20260707_025_close_the_loop.sql
--
-- Backs docs/loop-closure-plan.md Phase 1 (resolution photo + out-of-band
-- notification are already wired in code; this adds the persistence the loop
-- still lacked):
--   1. report_updates  — append-only status timeline (resident timeline +
--      Open311 service-request-updates feed source of truth)
--   2. report_csat     — one-tap 👍/👎 from the resolution email, persisted
--      (replaces the localStorage-only civic.resident_csat.v1 store)
--   3. reports.public_token — indexed lookup for the tokenized public status
--      page (/r/[token]) so emailed links resolve LIVE reports, not just the
--      demo corpus. Token is computed app-side (sha256(salt:id), salt stays in
--      the app env) and written when a link first leaves the system.
--   4. notifications delivery bookkeeping (delivered_at / delivery_error)
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout (IF NOT EXISTS / DROP-then-CREATE for policies).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. report_updates — append-only timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  status     report_status NOT NULL,
  note       text,
  photo_url  text,
  actor      text NOT NULL DEFAULT 'staff'
             CHECK (actor IN ('staff', 'system', 'resident')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_updates_report
  ON report_updates (report_id, created_at);

ALTER TABLE report_updates ENABLE ROW LEVEL SECURITY;

-- Reporter reads their own report's timeline; staff read their city's.
-- Writes are service-role only (server actions) → no INSERT/UPDATE policy.
DROP POLICY IF EXISTS report_updates_select ON report_updates;
CREATE POLICY report_updates_select ON report_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_updates.report_id
        AND (
          r.reporter_id = auth.uid()
          OR (is_staff() AND r.city_id = current_user_city_id())
        )
    )
  );

GRANT SELECT ON report_updates TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. report_csat — one rating per report, upserted from the email's one-tap
--    links (service role via the public status page; the reporter needs no
--    session, so there is no client write policy).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_csat (
  report_id  uuid PRIMARY KEY REFERENCES reports (id) ON DELETE CASCADE,
  rating     text NOT NULL CHECK (rating IN ('up', 'down')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_csat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_csat_select ON report_csat;
CREATE POLICY report_csat_select ON report_csat
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_csat.report_id
        AND (
          r.reporter_id = auth.uid()
          OR (is_staff() AND r.city_id = current_user_city_id())
        )
    )
  );

GRANT SELECT ON report_csat TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. reports.public_token — indexed resolution for /r/[token] on live data.
--    Nullable: stamped lazily the first time a public link is generated
--    (status-notify) or a report is closed. sha256 hex prefix, 24 chars.
-- ---------------------------------------------------------------------------
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_public_token
  ON reports (public_token)
  WHERE public_token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. notifications — delivery bookkeeping for the out-of-band email leg.
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivered_at   timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_error text;

COMMIT;
