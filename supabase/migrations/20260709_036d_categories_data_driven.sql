-- ===========================================================================
-- 036, Data-driven issue categories (issue #6)
--
-- The classification category was a Postgres ENUM (classification_category),
-- which hard-blocks a runtime-added issue type from ever being persisted: a
-- custom category can be created + routed in config, but the AI pipeline can
-- never write it because the column rejects any value outside the 12 built-ins.
--
-- This migration converts every classification_category column to plain `text`
-- so a custom slug persists with NO per-type schema change, and adds an
-- AI-facing `description` to issue_types so the model knows what the new type
-- looks like (mirrors crew_types.description). The 12 built-ins are unchanged.
-- Their string values are identical, just no longer enum-constrained.
--
-- Views and the one function that expose the enum in their result shape are
-- dropped and recreated verbatim (bodies captured from the live DB) so their
-- column type follows to `text`; consumers read it as a string either way.
-- ===========================================================================

BEGIN;

-- 1. Drop the objects that depend on the enum'd columns (recreated below).
DROP VIEW IF EXISTS public.metric_reports_by_category;
DROP VIEW IF EXISTS public.dashboard_reports_view;
DROP FUNCTION IF EXISTS public.city_category_breakdown(uuid, text[]);

-- 2. Convert every classification_category column (and array) to text. The
--    USING cast is a plain enum->text label copy, so existing rows are
--    byte-identical. PK columns rebuild their index transparently.
ALTER TABLE public.classifications
  ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE public.classifications
  ALTER COLUMN alternate_categories TYPE text[] USING alternate_categories::text[];
-- The column DEFAULT ('{}'::classification_category[]) still pins the enum type,
-- which would block DROP TYPE below. Re-point it at text[].
ALTER TABLE public.classifications
  ALTER COLUMN alternate_categories SET DEFAULT '{}'::text[];
ALTER TABLE public.classification_feedback
  ALTER COLUMN original_category TYPE text USING original_category::text;
ALTER TABLE public.classification_feedback
  ALTER COLUMN corrected_category TYPE text USING corrected_category::text;
ALTER TABLE public.category_routing
  ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE public.cost_rules
  ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE public.sla_targets
  ALTER COLUMN category TYPE text USING category::text;

-- 3. Recreate the dependent objects with their captured definitions (now text).
CREATE VIEW public.dashboard_reports_view AS
  SELECT r.id,
    r.city_id,
    c_city.slug AS city_slug,
    c_city.name AS city_name,
    r.location,
    st_x(r.location::geometry) AS lng,
    st_y(r.location::geometry) AS lat,
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
    cl.confidence,
    wo.team_key
   FROM reports r
     LEFT JOIN classifications cl ON cl.report_id = r.id
     LEFT JOIN work_orders wo ON wo.report_id = r.id
     LEFT JOIN cities c_city ON c_city.id = r.city_id
  WHERE r.status <> ALL (ARRAY['rejected'::report_status, 'merged'::report_status]);

CREATE VIEW public.metric_reports_by_category AS
  SELECT category,
    count(*) AS report_count
   FROM classifications cl
  GROUP BY category
  ORDER BY (count(*)) DESC;

CREATE OR REPLACE FUNCTION public.city_category_breakdown(_city_id uuid, _sources text[] DEFAULT ARRAY['resident'::text])
 RETURNS TABLE(category text, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Restore grants dropped with the recreated objects (match migration 001/009).
GRANT SELECT ON public.dashboard_reports_view TO anon, authenticated;
GRANT SELECT ON public.metric_reports_by_category TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.city_category_breakdown(uuid, text[]) TO anon, authenticated;

-- 4. Retire the now-unused enum type. Nothing references it after step 2/3.
DROP TYPE IF EXISTS public.classification_category;

-- 5. AI-facing description for custom issue types (issue #6). Lets the
--    classifier know what a runtime-added category looks like. Nullable so
--    existing rows and the 12 built-ins (which live in code) are unaffected.
ALTER TABLE public.issue_types
  ADD COLUMN IF NOT EXISTS description text;

COMMIT;
