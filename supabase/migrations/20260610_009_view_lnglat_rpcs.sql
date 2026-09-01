-- =============================================================================
-- Civic. Dashboard read-path repair: view lng/lat + tags, city RPCs
-- Migration: 20260610_009_view_lnglat_rpcs.sql
--
-- Fixes the dead dashboard read path:
--   (a) dashboard_reports_view exposed only the raw geography `location`, but
--       deck.gl + src/lib/dashboard-queries.ts select scalar `lng`/`lat`. The
--       view never projected them, so every fetchRecentReports / fetchReportMarkers
--       row came back with null coordinates. Add ST_X/ST_Y projections and a
--       `tags` passthrough (column added by migration 008).
--   (b) public.city_stats(uuid) and public.city_category_breakdown(uuid) are
--       called by dashboard-queries.ts:27,49 but were never defined anywhere,
--       so both RPCs 404'd and the dashboard fell back to empty stats. Define
--       them here with the exact columns the caller destructures.
--
-- All functions are SECURITY DEFINER with a pinned search_path and granted to
-- anon + authenticated to match the dashboard view's public read model.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. dashboard_reports_view: add lng/lat scalar projections + tags passthrough
--    Preserves every column from migration 003 (003 dropped `description` for
--    PII; that exclusion is kept). location stays for any geography consumer.
-- ---------------------------------------------------------------------------
-- DROP first: the live (dashboard-drift) version of this view had a different
-- column order, and CREATE OR REPLACE VIEW cannot reorder/rename columns.
DROP VIEW IF EXISTS dashboard_reports_view;

CREATE VIEW dashboard_reports_view AS
SELECT
  r.id,
  r.city_id,
  c_city.slug   AS city_slug,
  c_city.name   AS city_name,
  r.location,
  -- Scalar coordinates for deck.gl + dashboard-queries; geography -> geometry
  -- so ST_X/ST_Y return planar lng/lat (SRID 4326 axis order is lng, lat).
  ST_X(r.location::geometry) AS lng,
  ST_Y(r.location::geometry) AS lat,
  r.photo_public_url,
  r.status,
  r.address,
  -- description intentionally excluded: may contain reporter PII (migration 003)
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
WHERE r.status NOT IN ('rejected');

-- Re-grant access (CREATE OR REPLACE VIEW resets grants in some PG versions).
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. city_stats(_city_id), single-row aggregate consumed by fetchCityStats
--    (dashboard-queries.ts:27). Column names match the caller's destructure
--    exactly: total, open_count, resolved, this_week, prev_week, avg_hours.
--    avg_hours uses work_orders.completed_at (the only resolution timestamp);
--    null completions are excluded by AVG, yielding 0 when nothing is resolved.
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
    AND r.status <> 'rejected';
$$;

GRANT EXECUTE ON FUNCTION public.city_stats(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. city_category_breakdown(_city_id), per-category counts consumed by
--    fetchCategoryBreakdown (dashboard-queries.ts:49). Caller maps rows of
--    { category, count }; ordered by count desc to match the mock's ordering.
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
    AND r.status <> 'rejected'
  GROUP BY cl.category
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.city_category_breakdown(uuid) TO anon, authenticated;

COMMIT;
