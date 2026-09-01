-- =============================================================================
-- Civic, Cross-jurisdiction routing (DA-02)
-- Migration: 20260708_034_cross_jurisdiction.sql
--
-- category_routing.escalates_to_parent (migration 024) and cities.parent_id
-- (024) both exist but nothing reads them: a report on a county-owned asset
-- inside a city boundary still lands with the city. This adds the resolution:
--
--   1. work_orders.owner_city_id, the jurisdiction that actually owns the work
--      order, when it differs from the report's city (NULL = owned by the
--      report's own city; the common case). Additive + nullable, same pattern
--      as team_key (026) / due_at (032).
--   2. resolve_report_jurisdiction(_report_id). Returns the owning city id:
--      the parent city when the report's category is flagged
--      escalates_to_parent AND the city has a parent_id, else the report's own
--      city. Pure lookup over existing config; the pipeline stamps owner_city_id
--      from it.
--
-- Ships dark: no city seeds escalates_to_parent=true yet, so owner_city_id stays
-- NULL and routing is unchanged until a city opts in.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS owner_city_id uuid REFERENCES cities (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_owner_city
  ON work_orders (owner_city_id)
  WHERE owner_city_id IS NOT NULL;

-- Owning jurisdiction for a report: parent city on an escalating category,
-- else the report's own city. category_routing may have no row for the
-- category (COALESCE the flag to false); parent_id may be null (stay local).
CREATE OR REPLACE FUNCTION public.resolve_report_jurisdiction(_report_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(cr.escalates_to_parent, false) AND c.parent_id IS NOT NULL
      THEN c.parent_id
    ELSE r.city_id
  END
  FROM reports r
  JOIN cities c ON c.id = r.city_id
  LEFT JOIN classifications cl ON cl.report_id = r.id
  LEFT JOIN category_routing cr
    ON cr.city_id = r.city_id AND cr.category = cl.category
  WHERE r.id = _report_id;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_report_jurisdiction(uuid)
  TO anon, authenticated;

COMMIT;
