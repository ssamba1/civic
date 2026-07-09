-- 036 analytics RPCs
-- Closes REVAMP 3.3 / STATE 0.5 "analytics theater": the analytics widget
-- functions in src/lib/analytics-data.ts ignored city_id and returned mocks
-- (demo) or zeros (live). Live deployments with real reports saw an empty
-- analytics dashboard. These SECURITY DEFINER aggregates return real per-city
-- numbers; the app keeps its pretty demo literals only under DEMO_MODE.
--
-- Convention mirrors city_stats (migration 019/024): STABLE SECURITY DEFINER,
-- search_path=public, _city_id uuid + _sources text[] default resident,
-- status NOT IN ('rejected','merged') (migration 012), source = ANY(_sources).
-- 1:1 reports<->classifications; join is safe. Idempotent (CREATE OR REPLACE).

-- Daily created vs closed over a window. "created" = reports filed that day;
-- "closed" = work orders completed that day (completed_at), joined back to the
-- report so the city/source filter still applies.
CREATE OR REPLACE FUNCTION public.analytics_trend(
  _city_id uuid,
  _days int DEFAULT 14,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(day date, created bigint, closed bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT generate_series(
      (current_date - (_days - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date AS day
  ),
  created AS (
    SELECT r.created_at::date AS day, COUNT(*) AS n
    FROM reports r
    WHERE r.city_id = _city_id
      AND r.status NOT IN ('rejected', 'merged')
      AND r.source = ANY(_sources)
      AND r.created_at >= current_date - (_days - 1) * interval '1 day'
    GROUP BY 1
  ),
  closed AS (
    SELECT wo.completed_at::date AS day, COUNT(*) AS n
    FROM work_orders wo
    JOIN reports r ON r.id = wo.report_id
    WHERE r.city_id = _city_id
      AND r.status NOT IN ('rejected', 'merged')
      AND r.source = ANY(_sources)
      AND wo.completed_at IS NOT NULL
      AND wo.completed_at >= current_date - (_days - 1) * interval '1 day'
    GROUP BY 1
  )
  SELECT d.day,
         COALESCE(c.n, 0) AS created,
         COALESCE(x.n, 0) AS closed
  FROM days d
  LEFT JOIN created c ON c.day = d.day
  LEFT JOIN closed x ON x.day = d.day
  ORDER BY d.day;
$$;

-- Report counts by open-funnel status.
CREATE OR REPLACE FUNCTION public.analytics_status_funnel(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.status::text, COUNT(*)
  FROM reports r
  WHERE r.city_id = _city_id
    AND r.status IN ('open', 'dispatched', 'in_progress', 'closed')
    AND r.source = ANY(_sources)
  GROUP BY r.status;
$$;

-- AI severity (1..5) distribution from the latest classification per report.
CREATE OR REPLACE FUNCTION public.analytics_severity(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(severity int, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (c.report_id) c.report_id, c.severity
    FROM classifications c
    JOIN reports r ON r.id = c.report_id
    WHERE r.city_id = _city_id
      AND r.status NOT IN ('rejected', 'merged')
      AND r.source = ANY(_sources)
      AND c.no_issue_detected IS NOT TRUE
    ORDER BY c.report_id, c.created_at DESC
  )
  SELECT s.severity, COUNT(l.report_id)
  FROM generate_series(1, 5) AS s(severity)
  LEFT JOIN latest l ON l.severity = s.severity
  GROUP BY s.severity
  ORDER BY s.severity;
$$;

-- Report volume by day-of-week (0=Sun..6=Sat) x hour (0..23), local to the
-- server's timezone. Zero-filled to a full 7x24 grid.
CREATE OR REPLACE FUNCTION public.analytics_hourly_heatmap(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(day int, hour int, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH grid AS (
    SELECT d AS day, h AS hour
    FROM generate_series(0, 6) d, generate_series(0, 23) h
  ),
  hits AS (
    SELECT EXTRACT(DOW FROM r.created_at)::int AS day,
           EXTRACT(HOUR FROM r.created_at)::int AS hour,
           COUNT(*) AS n
    FROM reports r
    WHERE r.city_id = _city_id
      AND r.status NOT IN ('rejected', 'merged')
      AND r.source = ANY(_sources)
    GROUP BY 1, 2
  )
  SELECT g.day, g.hour, COALESCE(h.n, 0)
  FROM grid g
  LEFT JOIN hits h ON h.day = g.day AND h.hour = g.hour
  ORDER BY g.day, g.hour;
$$;

-- Top locations by report volume. No neighborhood dimension exists, so we group
-- by the real report address (best available signal); reports with no address
-- collapse to 'Unknown'.
CREATE OR REPLACE FUNCTION public.analytics_top_neighborhoods(
  _city_id uuid,
  _limit int DEFAULT 6,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(name text, count bigint, open bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(TRIM(r.address), ''), 'Unknown') AS name,
         COUNT(*) AS count,
         COUNT(*) FILTER (WHERE r.status IN ('open', 'dispatched', 'in_progress')) AS open
  FROM reports r
  WHERE r.city_id = _city_id
    AND r.status NOT IN ('rejected', 'merged')
    AND r.source = ANY(_sources)
  GROUP BY 1
  ORDER BY count DESC
  LIMIT _limit;
$$;

-- Average resolution hours per category vs the city's SLA target.
-- Target falls back to 72h when no sla_targets row exists for the category.
CREATE OR REPLACE FUNCTION public.analytics_category_resolution(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(category text, avg_hours numeric, target_hours int, count bigint)
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
  )
  SELECT l.category::text,
         COALESCE(ROUND(AVG(
           EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
         ) FILTER (WHERE wo.completed_at IS NOT NULL), 1), 0) AS avg_hours,
         COALESCE(st.hours, 72) AS target_hours,
         COUNT(*) AS count
  FROM latest l
  JOIN reports r ON r.id = l.report_id
  LEFT JOIN work_orders wo ON wo.report_id = l.report_id
  LEFT JOIN sla_targets st ON st.city_id = _city_id AND st.category = l.category
  GROUP BY l.category, st.hours
  ORDER BY count DESC;
$$;

-- MTTR (avg resolution hours) + SLA compliance, split this-week vs prev-week for
-- the delta. SLA compliance = share of completed work orders closed on/before
-- due_at (only work orders that carry a due_at count toward the ratio).
CREATE OR REPLACE FUNCTION public.analytics_mttr_sla(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(
  mttr_hours numeric,
  mttr_prev_hours numeric,
  sla_compliance_pct numeric,
  sla_denominator bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(ROUND(AVG(
      EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
    ) FILTER (WHERE wo.completed_at >= now() - interval '7 days'), 1), 0)
      AS mttr_hours,
    COALESCE(ROUND(AVG(
      EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
    ) FILTER (
      WHERE wo.completed_at >= now() - interval '14 days'
        AND wo.completed_at < now() - interval '7 days'
    ), 1), 0) AS mttr_prev_hours,
    COALESCE(ROUND(
      100.0 * COUNT(*) FILTER (WHERE wo.due_at IS NOT NULL AND wo.completed_at <= wo.due_at)
        / NULLIF(COUNT(*) FILTER (WHERE wo.due_at IS NOT NULL), 0), 1), 0)
      AS sla_compliance_pct,
    COUNT(*) FILTER (WHERE wo.due_at IS NOT NULL) AS sla_denominator
  FROM work_orders wo
  JOIN reports r ON r.id = wo.report_id
  WHERE r.city_id = _city_id
    AND r.status NOT IN ('rejected', 'merged')
    AND r.source = ANY(_sources)
    AND wo.completed_at IS NOT NULL;
$$;

-- Resolution-time histogram: completed work orders bucketed by hours from
-- report creation to completion. Fixed 5-bucket schema, zero-filled.
CREATE OR REPLACE FUNCTION public.analytics_resolution_distribution(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(label text, hours_max int, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH resolved AS (
    SELECT EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0 AS hrs
    FROM work_orders wo
    JOIN reports r ON r.id = wo.report_id
    WHERE r.city_id = _city_id
      AND r.status NOT IN ('rejected', 'merged')
      AND r.source = ANY(_sources)
      AND wo.completed_at IS NOT NULL
  ),
  buckets(label, hours_max, lo, hi) AS (
    VALUES
      ('<24h', 24, 0.0, 24.0),
      ('1-3d', 72, 24.0, 72.0),
      ('3-7d', 168, 72.0, 168.0),
      ('1-2w', 336, 168.0, 336.0),
      ('>2w', 9999, 336.0, 1e12)
  )
  SELECT b.label, b.hours_max,
         COUNT(rz.hrs) FILTER (WHERE rz.hrs >= b.lo AND rz.hrs < b.hi) AS count
  FROM buckets b
  LEFT JOIN resolved rz ON TRUE
  GROUP BY b.label, b.hours_max, b.lo, b.hi
  ORDER BY b.hours_max;
$$;

-- Reporter velocity: distinct reporters + total reports (app derives
-- reports_per_reporter). Spark comes from analytics_trend on the client side.
CREATE OR REPLACE FUNCTION public.analytics_reporter_velocity(
  _city_id uuid,
  _sources text[] DEFAULT ARRAY['resident'::text]
)
RETURNS TABLE(unique_reporters bigint, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT r.reporter_id), COUNT(*)
  FROM reports r
  WHERE r.city_id = _city_id
    AND r.status NOT IN ('rejected', 'merged')
    AND r.source = ANY(_sources);
$$;

GRANT EXECUTE ON FUNCTION public.analytics_reporter_velocity(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_resolution_distribution(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_trend(uuid, int, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_status_funnel(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_severity(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_hourly_heatmap(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_top_neighborhoods(uuid, int, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_category_resolution(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analytics_mttr_sla(uuid, text[]) TO anon, authenticated, service_role;
