-- =============================================================================
-- Civic, Zone-polygon geographic routing (LCP-15)
-- Migration: 20260708_033_routing_zones.sql
--
-- Category routing (city_teams.categories / category_routing) answers "which
-- team owns this KIND of issue". Zone routing answers "which team owns this
-- PLACE", e.g. a county maintains the arterials in one district while the city
-- owns the rest, or two public-works crews split the map by sector. This adds
-- an OPTIONAL geographic override layer:
--
--   1. routing_zones, per-city named polygons, each mapped to a team_key, with
--      a priority for overlap resolution.
--   2. resolve_zone_team(_report_id). Returns the team_key of the
--      highest-priority active zone whose polygon contains the report's
--      location, or NULL. Mirrors city_for_point()'s ST_Contains pattern.
--
-- Precedence (enforced in the pipeline, not here): category routing resolves
-- first; a non-NULL zone match then OVERRIDES it. No city has zones seeded, so
-- routing behavior is unchanged until a city opts in. Safe to ship dark.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS routing_zones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id    uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  team_key   text NOT NULL,
  -- Higher wins when polygons overlap; ties break on smallest area (most
  -- specific zone), matching city_for_point's smallest-area rule.
  priority   int  NOT NULL DEFAULT 0,
  boundary   geography(MULTIPOLYGON, 4326) NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routing_zones_city ON routing_zones (city_id);
-- GiST index over the polygon for fast ST_Contains at routing time.
CREATE INDEX IF NOT EXISTS idx_routing_zones_boundary
  ON routing_zones USING gist (boundary);

ALTER TABLE routing_zones ENABLE ROW LEVEL SECURITY;

-- Public read (routing config is not sensitive; mirrors sla_targets/city_teams);
-- staff write, scoped to their own city.
DROP POLICY IF EXISTS routing_zones_select ON routing_zones;
CREATE POLICY routing_zones_select ON routing_zones FOR SELECT USING (true);

DROP POLICY IF EXISTS routing_zones_write_staff ON routing_zones;
CREATE POLICY routing_zones_write_staff ON routing_zones
FOR ALL
USING (is_staff() AND city_id = current_user_city_id())
WITH CHECK (is_staff() AND city_id = current_user_city_id());

GRANT SELECT ON routing_zones TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- resolve_zone_team(), geographic team lookup for a report.
-- Takes the report id (not raw lng/lat) so the geometry never leaves the DB.
-- The pipeline holds only the report id at routing time. Returns NULL when the
-- city has no zones or the report's point falls outside every zone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_zone_team(_report_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT z.team_key
  FROM routing_zones z
  JOIN reports r ON r.id = _report_id
  WHERE z.active
    AND z.city_id = r.city_id
    AND r.location IS NOT NULL
    AND ST_Contains(z.boundary::geometry, r.location::geometry)
  ORDER BY z.priority DESC, ST_Area(z.boundary) ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_zone_team(uuid) TO anon, authenticated;

COMMIT;
