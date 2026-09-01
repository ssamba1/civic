-- =============================================================================
-- Civic. City center read path
-- Migration: 20260619_020_city_center_rpc.sql
--
-- cities.center is geography(POINT, 4326), written at onboarding (migration 019
-- as `SRID=4326;POINT(lng lat)`). PostgREST returns a geography column as opaque
-- WKB hex, so the dashboard map can't read the center back through a plain
-- select. Expose it as scalar lng/lat via an RPC, mirroring the ST_X/ST_Y
-- projection pattern already used for report coordinates in migration 009.
--
-- Consumed by fetchCityCenter (src/lib/dashboard-queries.ts), which centers the
-- fullscreen map on each city. The function is SECURITY DEFINER with a pinned
-- search_path and granted to anon + authenticated to match the public read model.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.city_center(_slug text)
RETURNS TABLE (
  lng double precision,
  lat double precision
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    -- geography -> geometry so ST_X/ST_Y return planar lng/lat (SRID 4326 axis
    -- order is lng, lat. Matches how report coords are projected in 009).
    ST_X(center::geometry) AS lng,
    ST_Y(center::geometry) AS lat
  FROM cities
  WHERE slug = _slug
    AND center IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.city_center(text) TO anon, authenticated;

COMMIT;
