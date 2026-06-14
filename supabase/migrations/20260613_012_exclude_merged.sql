-- =============================================================================
-- Civic – Exclude merged duplicates from public counts
-- Migration: 20260613_012_exclude_merged.sql
--
-- Completes the dedup feature (migration 011 + DEDUP_REPORTS). A duplicate
-- report is marked status='merged' and linked to its primary via the merges
-- table. But the public dashboard view and the city_stats / category_breakdown
-- RPCs only excluded 'rejected' — so merged duplicates still showed on the map
-- and inflated the counts, defeating the point of dedup.
--
-- This migration extends those three read paths to exclude 'merged' as well.
-- Merged rows remain in the reports table (linked via merges) for audit and for
-- staff drill-down; they are simply not counted as separate open issues.
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Idempotent: CREATE OR REPLACE for the RPCs, DROP+CREATE for the view (column
-- set unchanged from migration 009, so consumers are unaffected).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. dashboard_reports_view — exclude 'merged' (mirrors migration 009 exactly,
--    only the WHERE clause changes: NOT IN ('rejected') -> ('rejected','merged').
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS dashboard_reports_view;

CREATE VIEW dashboard_reports_view AS
SELECT
  r.id,
  r.city_id,
  c_city.slug   AS city_slug,
  c_city.name   AS city_name,
  r.location,
  ST_X(r.location::geometry) AS lng,
  ST_Y(r.location::geometry) AS lat,
  r.photo_public_url,
  r.status,
  r.address,
  r.tags,
  r.created_at,
  r.updated_at,
  cl.category,
  cl.subcategory,
  cl.severity,
  cl.hazard_radius_m,
  cl.visible_size_estimate,
  cl.is_emergency,
  cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c_city ON c_city.id = r.city_id
WHERE r.status NOT IN ('rejected', 'merged');

GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. city_stats — exclude 'merged' from the city report counts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.city_stats(_city_id uuid)
RETURNS TABLE (
  total      bigint,
  open_count bigint,
  resolved   bigint,
  this_week  bigint,
  prev_week  bigint,
  avg_hours  numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                                              AS total,
    COUNT(*) FILTER (WHERE r.status = 'open')                             AS open_count,
    COUNT(*) FILTER (WHERE r.status = 'closed')                           AS resolved,
    COUNT(*) FILTER (WHERE r.created_at >= now() - interval '7 days')     AS this_week,
    COUNT(*) FILTER (
      WHERE r.created_at >= now() - interval '14 days'
        AND r.created_at <  now() - interval '7 days'
    )                                                                     AS prev_week,
    COALESCE(
      ROUND(
        AVG(EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0)
          FILTER (WHERE wo.completed_at IS NOT NULL),
        1
      ),
      0
    )                                                                     AS avg_hours
  FROM reports r
  LEFT JOIN work_orders wo ON wo.report_id = r.id
  WHERE r.city_id = _city_id
    AND r.status NOT IN ('rejected', 'merged');
$$;

GRANT EXECUTE ON FUNCTION public.city_stats(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. city_category_breakdown — exclude 'merged' so duplicates don't double-count
--    in the per-category totals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.city_category_breakdown(_city_id uuid)
RETURNS TABLE (
  category classification_category,
  count    bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    cl.category,
    COUNT(*) AS count
  FROM reports r
  JOIN classifications cl ON cl.report_id = r.id
  WHERE r.city_id = _city_id
    AND r.status NOT IN ('rejected', 'merged')
  GROUP BY cl.category
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.city_category_breakdown(uuid) TO anon, authenticated;

COMMIT;
