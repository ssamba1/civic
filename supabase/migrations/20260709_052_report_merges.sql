-- =============================================================================
-- Civic – Staff duplicate-merge infrastructure
-- Migration: 20260709_052_report_merges.sql
--
-- Design:
--   Staff-only workflow. When two reports describe the same infrastructure
--   problem, staff pick a canonical (primary) one and mark the other as merged
--   into it. From that point the merged report is hidden from public views and
--   its upvotes are transferred to the canonical report.
--
--   We do NOT add a new status enum value — 'merged' already exists in the
--   report_status enum (see 20260527_001_initial_schema.sql line 27). Instead
--   we add a nullable `merged_into` FK column on `reports` so the canonical
--   target is always reachable. A non-null merged_into means "this report was
--   merged away; the source of truth is the canonical report it points to."
--
--   The `report_merges` audit table records every merge/unmerge event for
--   history and accountability. It is staff-only: residents never see it.
--
-- RLS strategy: mirror the pattern used throughout (is_staff() predicate,
--   see 20260527_001_initial_schema.sql line 285).
--   Default deny — no policy = no access.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add merged_into column to reports (nullable FK, self-referential)
-- ---------------------------------------------------------------------------
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES reports (id) ON DELETE SET NULL;

-- Index speeds up "which reports were merged into this canonical one?" lookup
CREATE INDEX IF NOT EXISTS idx_reports_merged_into ON reports (merged_into)
  WHERE merged_into IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. report_merges audit table
--
-- One row per merge action. Unique on merged_report_id because a report can
-- only be merged once (it's marked status='merged' and merged_into set).
-- When an unmerge happens the row is deleted (or the merged_into is cleared).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_merges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The report that survives and accumulates work / upvotes.
  canonical_report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  -- The report that is hidden / superseded. UNIQUE enforces "merged once".
  merged_report_id    uuid NOT NULL UNIQUE REFERENCES reports (id) ON DELETE CASCADE,
  -- Staff user who performed the merge (nullable: allow system/migration merges).
  merged_by           uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- Free-text reason visible to supervisors in the audit log.
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_merges_canonical
  ON report_merges (canonical_report_id);

-- ---------------------------------------------------------------------------
-- 3. RLS — staff-only read/write, default deny
-- ---------------------------------------------------------------------------
ALTER TABLE report_merges ENABLE ROW LEVEL SECURITY;

-- Staff in any city can read the full audit log (they already see all reports).
DROP POLICY IF EXISTS report_merges_staff_select ON report_merges;
CREATE POLICY report_merges_staff_select ON report_merges
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS report_merges_staff_insert ON report_merges;
CREATE POLICY report_merges_staff_insert ON report_merges
  FOR INSERT WITH CHECK (is_staff());

DROP POLICY IF EXISTS report_merges_staff_delete ON report_merges;
CREATE POLICY report_merges_staff_delete ON report_merges
  FOR DELETE USING (is_staff());

-- ---------------------------------------------------------------------------
-- 4. find_staff_duplicate_candidates(_report_id, _radius_m, _window_days)
--
-- Broader version of find_duplicate_report: no category filter, uses photo_phash
-- for visual similarity, and returns multiple candidates for the staff UI to rank.
-- Staff need to see potential duplicates even when category mismatch exists (AI
-- may have mis-classified one of them).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_staff_duplicate_candidates(
  _report_id   uuid,
  _radius_m    numeric DEFAULT 200,
  _window_days int     DEFAULT 90
)
RETURNS TABLE (
  candidate_id  uuid,
  distance_m    numeric,
  photo_phash   text,
  category      text,
  address       text,
  created_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH target AS (
    SELECT r.id, r.city_id, r.location, r.created_at, r.photo_phash
    FROM reports r
    WHERE r.id = _report_id
  )
  SELECT
    r2.id                                                            AS candidate_id,
    ROUND(ST_Distance(r2.location, t.location)::numeric, 2)         AS distance_m,
    r2.photo_phash,
    cl2.category::text,
    r2.address,
    r2.created_at
  FROM target t
  JOIN reports r2
    ON r2.city_id  = t.city_id
   AND r2.id      <> t.id
   AND r2.status  NOT IN ('merged', 'rejected')
   AND r2.merged_into IS NULL
   AND r2.created_at >= now() - make_interval(days => _window_days)
   AND ST_DWithin(r2.location, t.location, _radius_m)
  LEFT JOIN classifications cl2 ON cl2.report_id = r2.id
  ORDER BY ST_Distance(r2.location, t.location) ASC, r2.created_at ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.find_staff_duplicate_candidates(uuid, numeric, int)
  TO authenticated, service_role;

COMMIT;
