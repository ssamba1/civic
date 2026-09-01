-- =============================================================================
-- Civic, DB-backed per-city team routing
-- Migration: 20260707_026_team_routing.sql
--
-- REVAMP_PLAN 3.9 / onboarding spec §11: work orders gain a persisted team_key
-- resolved from the city's city_teams config at write time (classify pipeline,
-- staff category override, staff reassignment). Read surfaces prefer the stored
-- key and fall back to the static category→team default for legacy rows.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. work_orders.team_key, the owning app-level TeamId (text, matches
--    city_teams.team_key / teams.ts ids; NOT the work_order_department enum).
-- ---------------------------------------------------------------------------
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS team_key text;

-- Backfill existing rows from the static category→team defaults (teams.ts).
-- City-specific overrides only apply to rows written after this ships.
UPDATE work_orders wo
SET team_key = CASE cl.category
  WHEN 'pothole'         THEN 'streets_roads'
  WHEN 'sidewalk_damage' THEN 'sidewalks_ada'
  WHEN 'drainage'        THEN 'stormwater'
  WHEN 'water_leak'      THEN 'water_utilities'
  WHEN 'streetlight'     THEN 'street_lighting'
  WHEN 'downed_sign'     THEN 'traffic_engineering'
  WHEN 'faded_signage'   THEN 'traffic_engineering'
  WHEN 'tree_down'       THEN 'parks_forestry'
  WHEN 'graffiti'        THEN 'graffiti_abatement'
  WHEN 'illegal_dump'    THEN 'code_enforcement'
  WHEN 'debris'          THEN 'environmental_services'
  ELSE 'general_admin'
END
FROM classifications cl
WHERE cl.report_id = wo.report_id
  AND wo.team_key IS NULL;

-- ---------------------------------------------------------------------------
-- 2. dashboard_reports_view, expose team_key so the corpus mappers can
--    populate DashboardReport.assigned_team without a second query. Recreates
--    the migration-024 shape + the join; PII exclusions unchanged.
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
  r.source,
  r.created_at,
  r.updated_at,
  cl.category,
  cl.subcategory,
  cl.severity,
  cl.hazard_radius_m,
  cl.visible_size_estimate,
  cl.is_emergency,
  cl.confidence,
  wo.team_key
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN work_orders wo ON wo.report_id = r.id
LEFT JOIN cities c_city ON c_city.id = r.city_id
-- preserves migration 012: 'merged' duplicates stay out of the public view
WHERE r.status NOT IN ('rejected', 'merged');
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

COMMIT;
