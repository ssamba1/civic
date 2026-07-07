-- =============================================================================
-- Civic – City config + multi-tenant onboarding foundation
-- Migration: 20260707_024_city_config.sql
--
-- Authored as 20260614_015 on the docs/city-onboarding-plan branch; renumbered
-- to 024 at merge into feat/sidebar-shell (015 was taken by under_fix_estimates
-- and slots 016–023 had already shipped). cities.center was dropped from §2
-- here because migration 019 already adds it.
--
-- Backs the onboarding plan (docs/planning/ONBOARDING.md + F1/F4/F5 specs).
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Every statement is written idempotent (IF [NOT] EXISTS / DROP-then-CREATE for
-- policies) so a re-run is safe.
--
-- Sections:
--   1. reports: source column (real-vs-synthetic KPI separation) + nullable
--      reporter_id (imports/synthetic have no reporter) + re-import idempotency
--   2. cities: default_zoom, parent_id, setup_step + boundary→MULTIPOLYGON
--      (center ships in migration 019)
--   3. per-city config tables (F3): departments / routing / sla / cost
--   4. provision_jobs (F5 cold-start progress → wizard StatusBar via Realtime)
--   5. view + RPC updates (F1): expose source in the view; exclude non-resident
--      from KPI RPCs so synthetic/imported rows never inflate real metrics
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. reports — provenance + import support
-- ---------------------------------------------------------------------------

-- source: discriminates real resident reports from synthetic/imported cold-start
-- data. DEFAULT 'resident' means every existing row is treated as real → no
-- behavior change for current data. KPI RPCs (§5) count only 'resident'.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'resident';

-- Constrain to known sources (drop-then-add so a re-run reconciles the set).
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_source_check;
ALTER TABLE reports
  ADD CONSTRAINT reports_source_check
  CHECK (source IN ('resident', 'synthetic', 'import', 'open311', 'arcgis', 'csv'));

-- Imported/synthetic reports have no real reporter (F5). Resident inserts still
-- set reporter_id; RLS reports_insert_resident (reporter_id = auth.uid()) is
-- unaffected — imports run via the service role and bypass RLS.
ALTER TABLE reports ALTER COLUMN reporter_id DROP NOT NULL;

-- Upstream id for idempotent re-import (skip rows already pulled).
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS source_external_id text;

CREATE INDEX IF NOT EXISTS idx_reports_city_source
  ON reports (city_id, source);

-- One row per (city, source, upstream id) so re-running an import is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_source_external
  ON reports (city_id, source, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. cities — map config, tenancy hierarchy, onboarding progress
-- ---------------------------------------------------------------------------

-- cities.center is added by migration 019 (city_onboarding). Only the remaining
-- map/tenancy columns land here; the TIGER INTPTLON/INTPTLAT center still gets
-- written by provision_city() below.
ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS default_zoom int;

-- Tenancy hierarchy: a city points to its containing county (§6). NULL for
-- standalone / consolidated city-county governments (single-tenant).
ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES cities (id) ON DELETE SET NULL;

-- Onboarding wizard progress (UI §11 decision 2: DB-backed resume). 0 = draft.
ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS setup_step int NOT NULL DEFAULT 0;

-- boundary POLYGON → MULTIPOLYGON: real municipal limits are frequently
-- multipart (exclaves, annexed parcels, islands). A single-POLYGON column
-- rejects them and breaks provisionCity (F4 §3). ST_Multi normalizes existing
-- single polygons; NULL stays NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cities'
      AND column_name = 'boundary' AND udt_name = 'geography'
  ) AND (
    SELECT type FROM geography_columns
    WHERE f_table_schema = 'public' AND f_table_name = 'cities'
      AND f_geography_column = 'boundary'
  ) = 'POLYGON' THEN
    ALTER TABLE cities
      ALTER COLUMN boundary TYPE geography(MULTIPOLYGON, 4326)
      USING ST_Multi(boundary::geometry)::geography;
  END IF;
END $$;

-- 2.1 provision_city() — idempotent upsert called by src/lib/onboarding/
--     provision-city.ts (F4). Converts GeoJSON → geography, normalizes single
--     Polygon → MULTIPOLYGON, derives center from the boundary centroid when no
--     internal point is supplied, and always lands active=false. SECURITY DEFINER
--     + service-role-only (cities has no public write path).
CREATE OR REPLACE FUNCTION public.provision_city(
  _slug         text,
  _name         text,
  _state        text,
  _boundary     jsonb,
  _center_lng   double precision DEFAULT NULL,
  _center_lat   double precision DEFAULT NULL,
  _zoom         int DEFAULT NULL,
  _jurisdiction text DEFAULT NULL
)
RETURNS TABLE (id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _geog     geography(MULTIPOLYGON, 4326);
  _center   geography(POINT, 4326);
  _result   uuid;
BEGIN
  _geog := ST_Multi(ST_GeomFromGeoJSON(_boundary::text))::geography;
  IF _center_lng IS NULL OR _center_lat IS NULL THEN
    _center := ST_Centroid(_geog::geometry)::geography;
  ELSE
    _center := ST_SetSRID(ST_MakePoint(_center_lng, _center_lat), 4326)::geography;
  END IF;

  SELECT c.id INTO _existing FROM cities c WHERE c.slug = _slug;

  INSERT INTO cities (
    slug, name, state, boundary, center, default_zoom,
    open311_jurisdiction_id, active
  )
  VALUES (_slug, _name, _state, _geog, _center, _zoom, _jurisdiction, false)
  ON CONFLICT (slug) DO UPDATE SET
    boundary     = EXCLUDED.boundary,
    center       = EXCLUDED.center,
    default_zoom = EXCLUDED.default_zoom,
    open311_jurisdiction_id =
      COALESCE(EXCLUDED.open311_jurisdiction_id, cities.open311_jurisdiction_id)
  RETURNING cities.id INTO _result;

  RETURN QUERY SELECT _result, (_existing IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_city(
  text, text, text, jsonb, double precision, double precision, int, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_city(
  text, text, text, jsonb, double precision, double precision, int, text
) TO service_role;

-- 2.2 city_for_point() — resolve a coordinate to the SMALLEST-area city whose
--     boundary contains it (§6 containment: city beats county). Used by resident
--     city resolution to replace the hardcoded 'cumming' (fixes the multi-tenant
--     bug where every resident joined Cumming). Returns NULL when no boundary
--     contains the point (caller falls back).
CREATE OR REPLACE FUNCTION public.city_for_point(
  _lng double precision,
  _lat double precision
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT c.id
  FROM cities c
  WHERE c.boundary IS NOT NULL
    AND ST_Contains(
      c.boundary::geometry,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)
    )
  ORDER BY ST_Area(c.boundary) ASC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.city_for_point(double precision, double precision)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Per-city config tables (F3) — seeded from teams.ts defaults at provision.
--    team_id is the app-level TeamId (text), not the work_order_department enum.
--    category columns use the classification_category enum for type safety.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS city_departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  team_id       text NOT NULL,
  label         text NOT NULL,
  short_label   text,
  color         text,
  icon          text,
  contact_email text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, team_id)
);

CREATE TABLE IF NOT EXISTS category_routing (
  city_id             uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  category            classification_category NOT NULL,
  team_id             text NOT NULL,
  -- §6: route to parent (county) when this category maps to a county-owned asset.
  escalates_to_parent boolean NOT NULL DEFAULT false,
  PRIMARY KEY (city_id, category)
);

CREATE TABLE IF NOT EXISTS sla_targets (
  city_id  uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  category classification_category NOT NULL,
  hours    int NOT NULL CHECK (hours > 0),
  PRIMARY KEY (city_id, category)
);

CREATE TABLE IF NOT EXISTS cost_rules (
  city_id     uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  category    classification_category NOT NULL,
  est_minutes int,
  materials   jsonb NOT NULL DEFAULT '[]'::jsonb,
  est_cost    numeric,
  PRIMARY KEY (city_id, category)
);

CREATE INDEX IF NOT EXISTS idx_city_departments_city ON city_departments (city_id);

-- 3.1 RLS — departments/routing/sla are PUBLIC READ (they render the public
--     dashboard, like cities). cost_rules is internal → staff-only read.
--     Writes are staff-scoped to their own city (mirrors reports_*_staff).
--     The provisionCity template applier runs as service role → bypasses RLS.
ALTER TABLE city_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_routing ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_targets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rules       ENABLE ROW LEVEL SECURITY;

-- public read
DROP POLICY IF EXISTS city_departments_select ON city_departments;
CREATE POLICY city_departments_select ON city_departments FOR SELECT USING (true);
DROP POLICY IF EXISTS category_routing_select ON category_routing;
CREATE POLICY category_routing_select ON category_routing FOR SELECT USING (true);
DROP POLICY IF EXISTS sla_targets_select ON sla_targets;
CREATE POLICY sla_targets_select ON sla_targets FOR SELECT USING (true);

-- cost_rules: staff-only read (own city)
DROP POLICY IF EXISTS cost_rules_select_staff ON cost_rules;
CREATE POLICY cost_rules_select_staff ON cost_rules
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

-- staff write (own city) on all four config tables
DROP POLICY IF EXISTS city_departments_write_staff ON city_departments;
CREATE POLICY city_departments_write_staff ON city_departments
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS category_routing_write_staff ON category_routing;
CREATE POLICY category_routing_write_staff ON category_routing
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS sla_targets_write_staff ON sla_targets;
CREATE POLICY sla_targets_write_staff ON sla_targets
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS cost_rules_write_staff ON cost_rules;
CREATE POLICY cost_rules_write_staff ON cost_rules
  FOR ALL
  USING (is_staff() AND city_id = current_user_city_id())
  WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON city_departments, category_routing, sla_targets TO anon, authenticated;
GRANT SELECT ON cost_rules TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. provision_jobs — cold-start ingest progress (F5) → wizard StatusBar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS provision_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'ingesting', 'classifying', 'ready', 'error')),
  source     text,
  total      int NOT NULL DEFAULT 0,
  ingested   int NOT NULL DEFAULT 0,
  classified int NOT NULL DEFAULT 0,
  message    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provision_jobs_city ON provision_jobs (city_id);

ALTER TABLE provision_jobs ENABLE ROW LEVEL SECURITY;

-- Staff of the city read its job progress (the operator runs the wizard as staff/
-- admin). Writes are service-role (the ingest job) → bypass RLS.
DROP POLICY IF EXISTS provision_jobs_select_staff ON provision_jobs;
CREATE POLICY provision_jobs_select_staff ON provision_jobs
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON provision_jobs TO authenticated;

-- Realtime: the wizard subscribes to job rows for live counts (UI §11.3).
-- Guarded so a missing publication (non-Supabase target) doesn't fail the run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'provision_jobs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE provision_jobs;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. View + RPC updates (F1) — surface `source` for UI badging; exclude
--    non-resident rows from KPI aggregates so synthetic/imported data never
--    inflates real metrics (ONBOARDING.md §7). DEFAULT 'resident' keeps every
--    existing row counted → no behavior change for current data.
-- ---------------------------------------------------------------------------

-- 5.1 dashboard_reports_view: add `source` passthrough (preview badges synthetic).
--     Recreate (DROP+CREATE) to add a column; preserves the migration-009 shape
--     incl. the PII exclusions (no description, no reporter_id).
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
  cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c_city ON c_city.id = r.city_id
-- preserves migration 012: 'merged' duplicates stay out of the public view
WHERE r.status NOT IN ('rejected', 'merged');
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

-- 5.2 city_stats: source-parametrized. Defaults to resident-only so the public
--     dashboard KPIs stay clean (synthetic/imported never inflate metrics).
--     The wizard PREVIEW passes _sources => '{resident,synthetic,arcgis,...}' so a
--     synthetic-only city still shows a populated dashboard (the demo). The 1-arg
--     call city_stats(_city_id) resolves here via the default. Drop the old
--     1-arg version first to avoid overload ambiguity.
DROP FUNCTION IF EXISTS public.city_stats(uuid);
DROP FUNCTION IF EXISTS public.city_stats(uuid, text[]);
CREATE FUNCTION public.city_stats(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident']::text[]
)
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
    AND r.status NOT IN ('rejected', 'merged')   -- preserve migration 012
    AND r.source = ANY(_sources);
$$;
GRANT EXECUTE ON FUNCTION public.city_stats(uuid, text[]) TO anon, authenticated;

-- 5.3 city_category_breakdown: same source-parametrization.
DROP FUNCTION IF EXISTS public.city_category_breakdown(uuid);
DROP FUNCTION IF EXISTS public.city_category_breakdown(uuid, text[]);
CREATE FUNCTION public.city_category_breakdown(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident']::text[]
)
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
    AND r.status NOT IN ('rejected', 'merged')   -- preserve migration 012
    AND r.source = ANY(_sources)
  GROUP BY cl.category
  ORDER BY count DESC;
$$;
GRANT EXECUTE ON FUNCTION public.city_category_breakdown(uuid, text[]) TO anon, authenticated;

COMMIT;
