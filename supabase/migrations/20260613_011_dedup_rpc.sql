-- =============================================================================
-- Civic, Duplicate report detection RPC
-- Migration: 20260613_011_dedup_rpc.sql
--
-- Populates the previously-unused `merges` table. Detects whether a freshly
-- classified report is a duplicate of an EARLIER open report of the SAME
-- category within a geographic radius and time window (PostGIS ST_DWithin on
-- the geography column, the AGENTS.md-sanctioned geo dedup, not haversine in
-- app code).
--
-- This is geo + category + time dedup, NOT vector-embedding similarity: the
-- project has no pgvector extension, and the embedding cosine threshold for
-- "same pothole twice" was unresolved in research. Category-match within ~50m
-- within 30 days is a strong, deterministic duplicate signal that needs no new
-- infrastructure and uses the existing idx_reports_location GiST index. An
-- embedding refinement can layer on later by intersecting candidate sets.
--
-- NOT auto-applied. Run with: npm run db:migrate
-- The pipeline only calls this RPC when DEDUP_REPORTS=1, so until both the
-- migration is applied AND the flag is set, behavior is unchanged.
--
-- Re-runnable: CREATE OR REPLACE FUNCTION. No data mutated.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- find_duplicate_report(_report_id, _radius_m, _window_days)
--
-- Returns the single best PRIMARY candidate that _report_id duplicates, or no
-- rows when none qualify. A candidate qualifies when it is:
--   - in the same city
--   - status = 'open'
--   - the same classification category
--   - a DIFFERENT report, created STRICTLY EARLIER (the earlier one is primary)
--   - within _radius_m metres (ST_DWithin, geography → true metres)
--   - created within the last _window_days days
-- Ordered closest-first, then earliest-first; one row.
--
-- similarity_score = GREATEST(0, 1 - distance / radius), rounded to 2dp, a
-- proximity score in [0,1] for the merges.similarity_score column (category
-- match is already guaranteed by the WHERE clause).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_duplicate_report(
  _report_id   uuid,
  _radius_m    numeric DEFAULT 50,
  _window_days int     DEFAULT 30
)
RETURNS TABLE (
  primary_report_id uuid,
  distance_m        numeric,
  similarity_score  numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH target AS (
    SELECT r.id, r.city_id, r.location, r.created_at, cl.category
    FROM reports r
    JOIN classifications cl ON cl.report_id = r.id
    WHERE r.id = _report_id
  )
  SELECT
    r2.id AS primary_report_id,
    ROUND(ST_Distance(r2.location, t.location)::numeric, 2) AS distance_m,
    ROUND(
      GREATEST(0, 1 - (ST_Distance(r2.location, t.location) / _radius_m))::numeric,
      2
    ) AS similarity_score
  FROM target t
  JOIN reports r2
    ON r2.city_id = t.city_id
   AND r2.id <> t.id
   AND r2.status = 'open'
   AND r2.created_at < t.created_at
   AND r2.created_at >= now() - make_interval(days => _window_days)
   AND ST_DWithin(r2.location, t.location, _radius_m)
  JOIN classifications cl2
    ON cl2.report_id = r2.id
   AND cl2.category = t.category
  ORDER BY ST_Distance(r2.location, t.location) ASC, r2.created_at ASC
  LIMIT 1;
$$;

-- Pipeline calls this via the service-role client (RLS-bypassing), but grant
-- authenticated too so staff tooling can preview duplicate candidates.
GRANT EXECUTE ON FUNCTION public.find_duplicate_report(uuid, numeric, int)
  TO authenticated, service_role;

COMMIT;
