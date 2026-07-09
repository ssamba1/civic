-- 041 council districts + rollups (OUTFLANK #16 — council-district turf reports)
-- Per-district report stats so each council member gets their turf report; sells
-- to politicians, not just public works. Mirrors the routing_zones polygon
-- pattern (033) but semantically separate: districts are civic geography, not
-- crew routing. Boundaries are seeded per city (TIGER/census wards, or manual);
-- empty until a city adds them, so the UI degrades to an empty state.

CREATE TABLE IF NOT EXISTS public.council_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  rep_name text,
  boundary geography(MULTIPOLYGON, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_council_districts_boundary
  ON public.council_districts USING gist (boundary);
CREATE INDEX IF NOT EXISTS idx_council_districts_city
  ON public.council_districts (city_id);

-- RLS: districts + their reps are public record → public read; writes are
-- service-role only (bypasses RLS), so no write policy = default-deny for
-- anon/authenticated. (agents.md rule 3: RLS on every table, default deny.)
ALTER TABLE public.council_districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS council_districts_public_read ON public.council_districts;
CREATE POLICY council_districts_public_read
  ON public.council_districts FOR SELECT
  TO anon, authenticated
  USING (true);

-- Per-district rollup. Reports are matched to a district by point-in-polygon.
-- Synthetic resolution time (12 + severity*18h) mirrors the app's MTTR formula
-- so the turf report is consistent with the analytics dashboard until real
-- work-order completion timestamps exist per report.
CREATE OR REPLACE FUNCTION public.district_rollups(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(
  district_id uuid,
  name text,
  rep_name text,
  total bigint,
  open_count bigint,
  closed bigint,
  avg_resolution_hours numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    d.id,
    d.name,
    d.rep_name,
    COUNT(r.id) AS total,
    COUNT(r.id) FILTER (
      WHERE r.status IN ('open', 'dispatched', 'in_progress')
    ) AS open_count,
    COUNT(r.id) FILTER (WHERE r.status = 'closed') AS closed,
    COALESCE(ROUND(AVG(
      EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
    ) FILTER (WHERE wo.completed_at IS NOT NULL), 1), 0) AS avg_resolution_hours
  FROM public.council_districts d
  LEFT JOIN public.reports r
    ON r.city_id = d.city_id
    AND r.status NOT IN ('rejected', 'merged')
    AND r.source = ANY(_sources)
    AND ST_Contains(d.boundary::geometry, r.location::geometry)
  LEFT JOIN public.work_orders wo ON wo.report_id = r.id
  WHERE d.city_id = _city_id
  GROUP BY d.id, d.name, d.rep_name
  ORDER BY total DESC, d.name;
$$;

GRANT EXECUTE ON FUNCTION public.district_rollups(uuid, text[])
  TO anon, authenticated, service_role;
