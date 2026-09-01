-- =============================================================================
-- Civic, Liability attribution (Phase A)
-- Migration: 20260823_062_liability.sql
-- Spec: docs/planning/CAMERA_LIABILITY_PIPELINE.md §3.1
--
-- What this adds:
--   capital_jobs. A contracted piece of work with a footprint + completion date
--   warranties, one or more warranty windows attached to a capital job
--   utility_permits, a utility cut/trench whose permittee owes restoration
--   report_liability, the verdict, one immutable-ish row per report
--
-- Security model (read before touching the policies below):
--
--   These four tables are CITY-INTERNAL FINANCIAL RECORDS. They describe who a
--   city believes is on the hook for a defect and how much a contract was worth.
--   Exposure rules:
--
--     staff. SELECT only, scoped to their own city (is_staff() AND
--              city_id = current_user_city_id()). report_liability has no
--              city_id of its own, so it scopes through an EXISTS subquery on
--              its parent report.
--     admin. INSERT / UPDATE / DELETE (is_admin(), defined in 053).
--     contractors. NO POLICY AT ALL, deliberately. A contractor must never be
--              able to read capital_jobs (peer contract values), warranties
--              (their own exposure window), utility_permits, or the verdict
--              rows. Everything a contractor is allowed to see about a claim is
--              handed to them through the `claims` snapshot in 063, never by
--              reading these tables. Adding a contractor SELECT policy here
--              would leak every vendor's contract_value_cents to every vendor.
--     anon, nothing. Default deny: RLS enabled, no permissive policy.
--
--   Writes from the app all go through the service role (importers, the
--   liability evaluator), which bypasses RLS entirely.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS before every CREATE POLICY. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. reports.source, admit 'camera'
--
-- Drop-then-add so a re-run reconciles the whole value set (the idiom from
-- 024:39-42). The six values from 024 are repeated verbatim; 'camera' is the
-- seventh. Needed by Phase B (064); harmless before then.
-- ---------------------------------------------------------------------------
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_source_check;
ALTER TABLE reports
  ADD CONSTRAINT reports_source_check
  CHECK (source IN ('resident', 'synthetic', 'import', 'open311', 'arcgis', 'csv', 'camera'));

-- ---------------------------------------------------------------------------
-- 1. capital_jobs
--
-- footprint is geography(GEOMETRY, 4326). Not POINT: a resurfacing job is a
-- LINESTRING along a street centerline, an area job is a POLYGON. The evaluator
-- matches with ST_DWithin(footprint, report.location, MATCH_TOLERANCE_M) on
-- geography, so distances are metres and no projection choice is needed.
--
-- completed_at is a DATE (substantial completion), not a timestamptz: warranty
-- clocks are contractual calendar days, and the source data (paving schedules,
-- ArcGIS exports) has day granularity at best.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capital_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id              uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  -- Nullable: legacy jobs imported from a paving schedule often name a vendor
  -- that has no contractors row yet. A NULL here yields a verdict with a
  -- capital_job_id but a NULL liable_contractor_id, which the UI shows as
  -- "warranty in force, vendor unlinked" rather than pretending it is city cost.
  contractor_id        uuid REFERENCES contractors (id) ON DELETE SET NULL,
  contract_ref         text,
  job_type             text NOT NULL,
  description          text,
  footprint            geography(GEOMETRY, 4326) NOT NULL,
  completed_at         date NOT NULL,
  contract_value_cents bigint,
  source               text NOT NULL DEFAULT 'manual',
  source_external_id   text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capital_jobs_job_type_check
    CHECK (job_type IN ('resurfacing', 'sidewalk', 'signal', 'streetlight', 'other')),
  CONSTRAINT capital_jobs_source_check
    CHECK (source IN ('manual', 'csv', 'arcgis'))
);

-- Spatial gate for the candidate query. Without this, ST_DWithin degrades to a
-- full scan of every job in the city on every report submission.
CREATE INDEX IF NOT EXISTS idx_capital_jobs_footprint
  ON capital_jobs USING GIST (footprint);

-- Candidate pre-filter: city scope + the completed_at ordering used to break
-- distance ties toward the most recent job.
CREATE INDEX IF NOT EXISTS idx_capital_jobs_city_completed
  ON capital_jobs (city_id, completed_at);

-- Re-importing a paving schedule must not duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_capital_jobs_source_external
  ON capital_jobs (city_id, source, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. warranties
--
-- A job may carry several concurrent warranties (workmanship + manufacturer +
-- a maintenance bond), each with its own window and category coverage, so this
-- is a child table rather than columns on capital_jobs.
--
-- covers_categories NULL means "all categories". A non-NULL array is an
-- allow-list of Civic report categories, the evaluator zero-scores a job whose
-- warranty does not cover the report's category.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warranties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_job_id    uuid NOT NULL REFERENCES capital_jobs (id) ON DELETE CASCADE,
  warranty_type     text NOT NULL,
  starts_on         date NOT NULL,
  ends_on           date NOT NULL,
  covers_categories text[],
  bond_ref          text,
  bond_value_cents  bigint,
  notes             text,
  CONSTRAINT warranties_type_check
    CHECK (warranty_type IN ('workmanship', 'pavement_performance', 'manufacturer', 'maintenance_bond')),
  -- A window that ends before it starts is a data-entry error, and it would
  -- silently make every claim against the job unwinnable.
  CONSTRAINT warranties_window_check CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_warranties_capital_job
  ON warranties (capital_job_id);

-- The expiry sweep asks "which warranties lapse in the next N days".
CREATE INDEX IF NOT EXISTS idx_warranties_ends_on
  ON warranties (ends_on);

-- ---------------------------------------------------------------------------
-- 3. utility_permits
--
-- A utility cut degrades the pavement around it. The permittee owes restoration
-- for a city-defined degradation window after restored_on. permittee_name is
-- NOT NULL because permit data always names somebody even when that somebody
-- has no contractors row.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS utility_permits (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id                  uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  permittee_name           text NOT NULL,
  permittee_contractor_id  uuid REFERENCES contractors (id) ON DELETE SET NULL,
  permit_ref               text,
  trench                   geography(GEOMETRY, 4326) NOT NULL,
  restored_on              date,
  -- restored_on + the city's degradation window. NULL = window unknown; the
  -- evaluator treats that as "cannot assert liability" rather than "expired".
  liability_ends_on        date,
  source                   text NOT NULL DEFAULT 'manual',
  source_external_id       text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utility_permits_source_check
    CHECK (source IN ('manual', 'csv', 'arcgis'))
);

CREATE INDEX IF NOT EXISTS idx_utility_permits_trench
  ON utility_permits USING GIST (trench);

CREATE INDEX IF NOT EXISTS idx_utility_permits_city_liability
  ON utility_permits (city_id, liability_ends_on);

CREATE UNIQUE INDEX IF NOT EXISTS uq_utility_permits_source_external
  ON utility_permits (city_id, source, source_external_id)
  WHERE source_external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. report_liability
--
-- One row per report (report_id is the PK, so the evaluator UPSERTs). The row
-- is a snapshot of the verdict at evaluation time; is_stale marks rows whose
-- source data changed underneath them and that a future re-evaluation job
-- should revisit.
--
-- No city_id column: the report owns the city. Denormalising it here would
-- create a second source of truth that RLS could disagree with.
--
-- 'unknown' is NOT a synonym for 'city_cost'. unknown = the city has no capital
-- job / permit data loaded for this city at all, so no claim can be asserted
-- either way. city_cost = data exists and nothing matched. The UI must never
-- render unknown as if the city had confirmed it owns the cost.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_liability (
  report_id             uuid PRIMARY KEY REFERENCES reports (id) ON DELETE CASCADE,
  verdict               text NOT NULL,
  capital_job_id        uuid REFERENCES capital_jobs (id) ON DELETE SET NULL,
  warranty_id           uuid REFERENCES warranties (id) ON DELETE SET NULL,
  utility_permit_id     uuid REFERENCES utility_permits (id) ON DELETE SET NULL,
  liable_contractor_id  uuid REFERENCES contractors (id) ON DELETE SET NULL,
  window_ends_on        date,
  match_distance_m      numeric,
  confidence            numeric NOT NULL,
  evaluated_at          timestamptz NOT NULL DEFAULT now(),
  is_stale              boolean NOT NULL DEFAULT false,
  CONSTRAINT report_liability_verdict_check
    CHECK (verdict IN ('contractor_warranty', 'utility_restoration', 'city_cost', 'unknown')),
  CONSTRAINT report_liability_confidence_check
    CHECK (confidence >= 0 AND confidence <= 1)
);

-- The expiry sweep: "which live liabilities lapse soon". Partial index because
-- city_cost rows (the overwhelming majority) have nothing to sweep.
CREATE INDEX IF NOT EXISTS idx_report_liability_sweep
  ON report_liability (window_ends_on)
  WHERE verdict <> 'city_cost';

CREATE INDEX IF NOT EXISTS idx_report_liability_capital_job
  ON report_liability (capital_job_id)
  WHERE capital_job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS. Default deny everywhere, staff read own city, admin write
-- ---------------------------------------------------------------------------
ALTER TABLE capital_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties       ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_permits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_liability ENABLE ROW LEVEL SECURITY;

-- --- capital_jobs ----------------------------------------------------------
DROP POLICY IF EXISTS capital_jobs_staff_select ON capital_jobs;
CREATE POLICY capital_jobs_staff_select ON capital_jobs
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS capital_jobs_admin_insert ON capital_jobs;
CREATE POLICY capital_jobs_admin_insert ON capital_jobs
  FOR INSERT WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS capital_jobs_admin_update ON capital_jobs;
CREATE POLICY capital_jobs_admin_update ON capital_jobs
  FOR UPDATE USING (is_admin() AND city_id = current_user_city_id())
  WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS capital_jobs_admin_delete ON capital_jobs;
CREATE POLICY capital_jobs_admin_delete ON capital_jobs
  FOR DELETE USING (is_admin() AND city_id = current_user_city_id());

-- --- warranties ------------------------------------------------------------
-- No city_id of its own; scope through the parent capital job. The EXISTS
-- subquery runs against capital_jobs with RLS applied to the *subquery's*
-- caller too, but that is harmless here: the predicate is the same city test.
DROP POLICY IF EXISTS warranties_staff_select ON warranties;
CREATE POLICY warranties_staff_select ON warranties
  FOR SELECT USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM capital_jobs cj
      WHERE cj.id = warranties.capital_job_id
        AND cj.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS warranties_admin_insert ON warranties;
CREATE POLICY warranties_admin_insert ON warranties
  FOR INSERT WITH CHECK (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM capital_jobs cj
      WHERE cj.id = warranties.capital_job_id
        AND cj.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS warranties_admin_update ON warranties;
CREATE POLICY warranties_admin_update ON warranties
  FOR UPDATE USING (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM capital_jobs cj
      WHERE cj.id = warranties.capital_job_id
        AND cj.city_id = current_user_city_id()
    )
  )
  WITH CHECK (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM capital_jobs cj
      WHERE cj.id = warranties.capital_job_id
        AND cj.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS warranties_admin_delete ON warranties;
CREATE POLICY warranties_admin_delete ON warranties
  FOR DELETE USING (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM capital_jobs cj
      WHERE cj.id = warranties.capital_job_id
        AND cj.city_id = current_user_city_id()
    )
  );

-- --- utility_permits -------------------------------------------------------
DROP POLICY IF EXISTS utility_permits_staff_select ON utility_permits;
CREATE POLICY utility_permits_staff_select ON utility_permits
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS utility_permits_admin_insert ON utility_permits;
CREATE POLICY utility_permits_admin_insert ON utility_permits
  FOR INSERT WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS utility_permits_admin_update ON utility_permits;
CREATE POLICY utility_permits_admin_update ON utility_permits
  FOR UPDATE USING (is_admin() AND city_id = current_user_city_id())
  WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS utility_permits_admin_delete ON utility_permits;
CREATE POLICY utility_permits_admin_delete ON utility_permits
  FOR DELETE USING (is_admin() AND city_id = current_user_city_id());

-- --- report_liability ------------------------------------------------------
-- City scope comes from the parent report (this table has no city_id).
DROP POLICY IF EXISTS report_liability_staff_select ON report_liability;
CREATE POLICY report_liability_staff_select ON report_liability
  FOR SELECT USING (
    is_staff()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_liability.report_id
        AND r.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS report_liability_admin_insert ON report_liability;
CREATE POLICY report_liability_admin_insert ON report_liability
  FOR INSERT WITH CHECK (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_liability.report_id
        AND r.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS report_liability_admin_update ON report_liability;
CREATE POLICY report_liability_admin_update ON report_liability
  FOR UPDATE USING (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_liability.report_id
        AND r.city_id = current_user_city_id()
    )
  )
  WITH CHECK (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_liability.report_id
        AND r.city_id = current_user_city_id()
    )
  );

DROP POLICY IF EXISTS report_liability_admin_delete ON report_liability;
CREATE POLICY report_liability_admin_delete ON report_liability
  FOR DELETE USING (
    is_admin()
    AND EXISTS (
      SELECT 1 FROM reports r
      WHERE r.id = report_liability.report_id
        AND r.city_id = current_user_city_id()
    )
  );

-- NOTE: there is intentionally NO contractor policy on any of the four tables
-- above. See the security model in the header, contractors learn about their
-- exposure only through the `claims` snapshot (migration 063).

-- ---------------------------------------------------------------------------
-- Candidate RPCs for the liability join (spec §3.2). Called by
-- src/lib/liability/db.ts under the service role. PostgREST filters cannot
-- express ST_DWithin, and app-side distance math is banned (AGENTS.md rule #7).
-- Signatures mirror the contract documented in db.ts's header verbatim.
--
-- SECURITY: not SECURITY DEFINER; EXECUTE revoked from anon/authenticated and
-- granted to service_role only. Capital-job footprints and trench geometries
-- (with contract refs) must not be probeable by residents or contractors.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liability_candidate_jobs(
  _city_id uuid,
  _lng double precision,
  _lat double precision,
  _tolerance_m double precision,
  _as_of date
)
RETURNS TABLE (
  id uuid,
  contractor_id uuid,
  contract_ref text,
  job_type text,
  completed_at date,
  source text,
  distance_m double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    cj.id,
    cj.contractor_id,
    cj.contract_ref,
    cj.job_type,
    cj.completed_at,
    cj.source,
    ST_Distance(
      cj.footprint,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography
    ) AS distance_m
  FROM capital_jobs cj
  WHERE cj.city_id = _city_id
    AND cj.completed_at <= _as_of
    AND ST_DWithin(
      cj.footprint,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography,
      _tolerance_m
    )
  ORDER BY distance_m ASC;
$$;

CREATE OR REPLACE FUNCTION public.liability_candidate_permits(
  _city_id uuid,
  _lng double precision,
  _lat double precision,
  _tolerance_m double precision,
  _as_of date
)
RETURNS TABLE (
  id uuid,
  permittee_name text,
  permittee_contractor_id uuid,
  permit_ref text,
  liability_ends_on date,
  distance_m double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    up.id,
    up.permittee_name,
    up.permittee_contractor_id,
    up.permit_ref,
    up.liability_ends_on,
    ST_Distance(
      up.trench,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography
    ) AS distance_m
  FROM utility_permits up
  WHERE up.city_id = _city_id
    AND ST_DWithin(
      up.trench,
      ST_SetSRID(ST_MakePoint(_lng, _lat), 4326)::geography,
      _tolerance_m
    )
  ORDER BY distance_m ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.liability_candidate_jobs(uuid, double precision, double precision, double precision, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.liability_candidate_permits(uuid, double precision, double precision, double precision, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liability_candidate_jobs(uuid, double precision, double precision, double precision, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.liability_candidate_permits(uuid, double precision, double precision, double precision, date) TO service_role;

COMMIT;
