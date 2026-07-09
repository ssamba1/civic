-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: 036b_resolution_distribution.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

CREATE OR REPLACE FUNCTION public.analytics_resolution_distribution(_city_id uuid, _sources text[] DEFAULT ARRAY['resident'::text])
 RETURNS TABLE(label text, hours_max integer, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
