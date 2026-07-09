-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: routing_060_routing_unit_load_rpc.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

CREATE OR REPLACE FUNCTION public.routing_unit_load(_city_id uuid)
 RETURNS TABLE(id uuid, parent_id uuid, kind text, categories text[], skills text[], is_contractor boolean, contractor_id uuid, capacity integer, cost_per_job numeric, sla_hours integer, parallelism integer, emergency_reserve numeric, shift_windows jsonb, depot_lng double precision, depot_lat double precision, active boolean, open_work_orders bigint, open_minutes bigint, last_assigned_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    o.id, o.parent_id, o.kind, o.categories, o.skills, o.is_contractor,
    o.contractor_id, o.capacity, o.cost_per_job, o.sla_hours, o.parallelism,
    o.emergency_reserve, o.shift_windows,
    ST_X(o.depot::geometry) AS depot_lng,
    ST_Y(o.depot::geometry) AS depot_lat,
    o.active,
    COALESCE(l.open_wos, 0)   AS open_work_orders,
    COALESCE(l.open_min, 0)   AS open_minutes,
    l.last_assigned_at
  FROM org_units o
  LEFT JOIN LATERAL (
    SELECT
      count(*)                          AS open_wos,
      COALESCE(sum(w.est_minutes), 0)   AS open_min,
      max(w.assigned_at)                AS last_assigned_at
    FROM work_orders w
    JOIN reports r ON r.id = w.report_id
    WHERE w.assigned_unit_id = o.id
      AND w.completed_at IS NULL
      AND r.status NOT IN ('closed', 'merged', 'rejected')
  ) l ON true
  WHERE o.city_id = _city_id AND o.active = true;
$function$
;

CREATE OR REPLACE FUNCTION public.routing_advisory_key(_city_id uuid)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ('x' || substr(md5(_city_id::text), 1, 8))::bit(32)::int;
$function$
;
