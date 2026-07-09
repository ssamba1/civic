-- OUTFLANK #40: peer-city benchmark analytics
-- Exposes per-city aggregate metrics for cross-city comparison.
-- RLS note: this is a public-read aggregate view — no PII, no row-level secrets.
-- Only city-level aggregates are returned; individual reports are never exposed.

-- ---------------------------------------------------------------------------
-- Function: peer_city_benchmarks()
-- Returns one row per city: total reports, avg resolution hours, close rate,
-- and a reports-per-capita placeholder (NULL until population data is seeded).
-- SECURITY DEFINER so it can read reports without exposing the table directly
-- to anon callers. Stable (read-only, result cacheable per transaction).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.peer_city_benchmarks()
RETURNS TABLE (
  city_id            uuid,
  city_name          text,
  state              text,
  total_reports      bigint,
  avg_resolution_hours numeric,
  close_rate         numeric,
  reports_per_capita numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id                                                      AS city_id,
    c.name                                                    AS city_name,
    c.state                                                   AS state,
    COUNT(r.id)                                               AS total_reports,
    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
      ) FILTER (WHERE wo.completed_at IS NOT NULL),
      0
    )                                                         AS avg_resolution_hours,
    COALESCE(
      COUNT(r.id) FILTER (WHERE r.status = 'closed')::numeric
        / NULLIF(COUNT(r.id), 0),
      0
    )                                                         AS close_rate,
    NULL::numeric                                             AS reports_per_capita
  FROM cities c
  LEFT JOIN reports r
    ON r.city_id = c.id
    AND r.status NOT IN ('rejected', 'merged')
  LEFT JOIN work_orders wo
    ON wo.report_id = r.id
  GROUP BY c.id, c.name, c.state
  HAVING COUNT(r.id) > 0
  ORDER BY avg_resolution_hours ASC, city_name ASC;
$$;

-- Grant execute to all auth levels so PostgREST can call it via RPC.
GRANT EXECUTE ON FUNCTION public.peer_city_benchmarks() TO anon, authenticated, service_role;
