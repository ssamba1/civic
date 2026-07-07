-- =============================================================================
-- Civic – Durable resident upvotes + per-city custom issue types
-- Migration: 20260707_027_upvotes_issue_types.sql
--
-- REVAMP_PLAN 3.3 (demo-to-prod): the last two operational localStorage
-- stores gain DB backing.
--   1. report_upvotes — one row per (report, user); written by the signed-in
--      (incl. anonymous-session) resident directly under RLS.
--   2. issue_types    — dispatcher-defined categories; staff-scoped writes.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. report_upvotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_upvotes (
  report_id  uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_upvotes_report ON report_upvotes (report_id);

ALTER TABLE report_upvotes ENABLE ROW LEVEL SECURITY;

-- Residents manage their OWN upvote rows; nobody reads another user's rows
-- directly (user_id would leak who upvoted what) — aggregate counts go
-- through the RPC below.
DROP POLICY IF EXISTS report_upvotes_select_own ON report_upvotes;
CREATE POLICY report_upvotes_select_own ON report_upvotes
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS report_upvotes_insert_own ON report_upvotes;
CREATE POLICY report_upvotes_insert_own ON report_upvotes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS report_upvotes_delete_own ON report_upvotes;
CREATE POLICY report_upvotes_delete_own ON report_upvotes
  FOR DELETE USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON report_upvotes TO authenticated;

-- Aggregate counts without exposing user ids. SECURITY DEFINER so the
-- aggregate sees all rows regardless of the caller's RLS view.
CREATE OR REPLACE FUNCTION public.report_upvote_counts(_report_ids uuid[])
RETURNS TABLE (report_id uuid, upvotes bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ru.report_id, COUNT(*) AS upvotes
  FROM report_upvotes ru
  WHERE ru.report_id = ANY(_report_ids)
  GROUP BY ru.report_id;
$$;
GRANT EXECUTE ON FUNCTION public.report_upvote_counts(uuid[])
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. issue_types — dispatcher-defined categories (parallel to the compile-time
--    ReportCategory union; display/routing config only).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  key        text NOT NULL,               -- 'custom_<slug>' app-level id
  label      text NOT NULL,
  color      text,
  team_key   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, key)
);

CREATE INDEX IF NOT EXISTS idx_issue_types_city ON issue_types (city_id);

ALTER TABLE issue_types ENABLE ROW LEVEL SECURITY;

-- Public read (they render on routing/display surfaces, like city_teams);
-- staff-scoped writes (mirrors the migration-024 config tables).
DROP POLICY IF EXISTS issue_types_select ON issue_types;
CREATE POLICY issue_types_select ON issue_types FOR SELECT USING (true);

DROP POLICY IF EXISTS issue_types_write_staff ON issue_types;
CREATE POLICY issue_types_write_staff ON issue_types
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON issue_types TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON issue_types TO authenticated;

COMMIT;
