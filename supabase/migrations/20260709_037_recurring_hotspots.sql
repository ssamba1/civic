-- 037 recurring hotspots (OUTFLANK #41 — recurring-problem detection)
-- "This drain floods every heavy rain." Groups a city's reports by category and
-- a ~100m spatial grid cell, surfacing locations where the same problem recurs
-- across multiple distinct time windows. Pre-empting recurring failures is the
-- mayor-facing pitch; this RPC is the data spine for it.
--
-- Grid: ST_SnapToGrid on the geometry cast at 0.001 deg (~111m N-S). Coarse but
-- cheap and index-free-friendly; DBSCAN was considered but grid-snap is
-- deterministic and adequate at pilot scale. Representative point = centroid of
-- the cell's reports. "episodes" = distinct ISO weeks the cell was reported in —
-- a cell reported 5 times in one week is one incident, not a recurring pattern;
-- recurrence needs >= 2 episodes.
--
-- Convention mirrors the analytics RPCs (036): STABLE SECURITY DEFINER,
-- search_path=public, exclude rejected/merged, source = ANY(_sources).
CREATE OR REPLACE FUNCTION public.analytics_recurring_hotspots(
  _city_id uuid,
  _min_count int DEFAULT 3,
  _min_episodes int DEFAULT 2,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(
  category text,
  lng double precision,
  lat double precision,
  total bigint,
  open_count bigint,
  episodes bigint,
  first_seen date,
  last_seen date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (c.report_id) c.report_id, c.category
    FROM classifications c
    JOIN reports r ON r.id = c.report_id
    WHERE r.city_id = _city_id
      AND r.status NOT IN ('rejected', 'merged')
      AND r.source = ANY(_sources)
      AND c.no_issue_detected IS NOT TRUE
    ORDER BY c.report_id, c.created_at DESC
  ),
  clustered AS (
    SELECT
      l.category,
      ST_SnapToGrid(r.location::geometry, 0.001) AS cell,
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE r.status IN ('open', 'dispatched', 'in_progress')
      ) AS open_count,
      COUNT(DISTINCT date_trunc('week', r.created_at)) AS episodes,
      MIN(r.created_at)::date AS first_seen,
      MAX(r.created_at)::date AS last_seen,
      ST_Centroid(ST_Collect(r.location::geometry)) AS centroid
    FROM reports r
    JOIN latest l ON l.report_id = r.id
    GROUP BY l.category, ST_SnapToGrid(r.location::geometry, 0.001)
  )
  SELECT
    category,
    ST_X(centroid) AS lng,
    ST_Y(centroid) AS lat,
    total,
    open_count,
    episodes,
    first_seen,
    last_seen
  FROM clustered
  WHERE total >= _min_count
    AND episodes >= _min_episodes
  ORDER BY episodes DESC, total DESC;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_recurring_hotspots(uuid, int, int, text[])
  TO anon, authenticated, service_role;
