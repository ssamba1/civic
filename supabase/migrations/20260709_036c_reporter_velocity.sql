-- RECOVERED 2026-07-09 from live DB introspection (project gisoowyezwhdrozettbg).
-- This migration was applied to prod by a prior session but its SQL was never
-- committed. Reconstructed via pg_catalog; ledger entry: 036c_reporter_velocity.
-- Grants not captured; RLS/policies/indexes/constraints/defaults are.

CREATE OR REPLACE FUNCTION public.analytics_reporter_velocity(_city_id uuid, _sources text[] DEFAULT ARRAY['resident'::text])
 RETURNS TABLE(unique_reporters bigint, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT r.reporter_id), COUNT(*)
  FROM reports r
  WHERE r.city_id = _city_id
    AND r.status NOT IN ('rejected', 'merged')
    AND r.source = ANY(_sources);
$function$
;
