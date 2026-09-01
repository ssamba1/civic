-- =============================================================================
-- Civic, Contractor claim packets (Phase C)
-- Migration: 20260823_063_claims.sql
-- Spec: docs/planning/CAMERA_LIABILITY_PIPELINE.md §5.2
--
-- A claim is the city formally telling a contractor "this defect is inside your
-- warranty window; fix it at your cost". It is assembled automatically from a
-- report_liability verdict but is NEVER sent automatically, staff approve.
--
-- Security model:
--
--   staff. SELECT, own city only.
--   admin, INSERT / UPDATE (state transitions, recovery amounts).
--                 No DELETE policy: a claim that was sent is a record of what
--                 the city asserted and must remain reproducible. Withdrawing a
--                 claim is a state change ('dismissed'), not a delete.
--   contractor. SELECT ONLY their own claims (liable_contractor_id =
--                 current_contractor_id()) AND ONLY once the claim has left the
--                 draft/approved stage. Drafts are staff working documents:
--                 they may contain a wrong vendor, an unedited packet, or an
--                 estimate staff is still arguing about, and a contractor who
--                 could read them would see accusations the city has not made
--                 yet. Contractors get no INSERT/UPDATE policy at all. Their
--                 responses flow through the existing work_orders
--                 contractor_status path (053), which is service-role mediated.
--   anon, nothing.
--
-- `packet` is an immutable jsonb snapshot taken at assembly time. If a capital
-- job row is later corrected, the claim as sent must still be reproducible,
-- so nothing here re-joins to capital_jobs at read time.
--
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS, wrapped in a transaction.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. claims
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS claims (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id                uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  report_id              uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  -- Nullable: a utility claim may name a permittee that has no contractors row.
  -- Such a claim is deliverable by staff out-of-band but invisible to the
  -- portal, which is correct. There is no portal account to show it to.
  liable_contractor_id   uuid REFERENCES contractors (id) ON DELETE SET NULL,
  basis                  text NOT NULL,
  state                  text NOT NULL DEFAULT 'draft',
  packet                 jsonb NOT NULL,
  estimated_value_cents  bigint,
  recovered_value_cents  bigint,
  sent_at                timestamptz,
  responded_at           timestamptz,
  resolved_at            timestamptz,
  created_by             uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_basis_check
    CHECK (basis IN ('warranty', 'utility_restoration')),
  CONSTRAINT claims_state_check
    CHECK (state IN ('draft', 'approved', 'sent', 'accepted', 'declined', 'disputed', 'resolved', 'dismissed'))
);

-- The review queue is "all claims in city X with state Y", so the composite
-- index is (city_id, state) in that order.
CREATE INDEX IF NOT EXISTS idx_claims_queue ON claims (city_id, state);

-- The contractor portal reads by vendor; the recovery ledger groups by vendor.
CREATE INDEX IF NOT EXISTS idx_claims_contractor
  ON claims (liable_contractor_id)
  WHERE liable_contractor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_report ON claims (report_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_staff_select ON claims;
CREATE POLICY claims_staff_select ON claims
  FOR SELECT USING (is_staff() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS claims_admin_insert ON claims;
CREATE POLICY claims_admin_insert ON claims
  FOR INSERT WITH CHECK (is_admin() AND city_id = current_user_city_id());

DROP POLICY IF EXISTS claims_admin_update ON claims;
CREATE POLICY claims_admin_update ON claims
  FOR UPDATE USING (is_admin() AND city_id = current_user_city_id())
  WITH CHECK (is_admin() AND city_id = current_user_city_id());

-- Contractors see their own claims, and only after the city has actually sent
-- them. 'draft' and 'approved' (approved = queued for the next batch delivery,
-- not yet delivered) are excluded on purpose. See the header.
DROP POLICY IF EXISTS claims_contractor_select ON claims;
CREATE POLICY claims_contractor_select ON claims
  FOR SELECT USING (
    liable_contractor_id IS NOT NULL
    AND liable_contractor_id = current_contractor_id()
    AND state IN ('sent', 'accepted', 'declined', 'disputed', 'resolved')
  );

-- No contractor INSERT/UPDATE policy and no DELETE policy for anyone: see the
-- header. Every write is a service-role server action.

COMMIT;
