-- =============================================================================
-- Civic – Contractor Portal
-- Migration: 20260709_053_contractors.sql
--
-- Security model (read this before touching anything below):
--
--   Contractors are EXTERNAL vendors. They log into the app with a regular
--   Supabase Auth account but are NOT in the `users` (staff) table. Instead
--   they have a row in `contractors` whose `email` column is the canonical link
--   to their auth identity (auth.users.email).
--
--   The SQL helper `current_contractor_id()` (SECURITY DEFINER, runs as the
--   defining role) maps the JWT email → contractors.id. All RLS policies on
--   work_orders that grant contractor access use this function so the mapping
--   is centralised and cannot be forged by a contractor supplying their own id.
--
--   Work-order RLS:
--     SELECT  – contractor sees ONLY rows where work_orders.contractor_id =
--               current_contractor_id(). An unassigned (NULL contractor_id) row
--               is invisible to contractors. A contractor from city A cannot see
--               city B's work orders.
--     UPDATE  – contractors get NO direct UPDATE policy (RLS can't restrict
--               columns, only rows). All writes go through the service-role
--               server action updateWorkOrderProgress(), which enforces ownership
--               AND a column whitelist. See the work_orders section below.
--
--   Contractors table:
--     Admin and staff can read/write contractors (manage list, assign to WOs).
--     Contractors themselves cannot read or modify the contractors table —
--     they have no SELECT policy on it, so they cannot enumerate peers.
--
--   Default deny: no policy = no access. Every table created here starts
--   with RLS enabled and no open policies.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. contractors table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contractors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- City that owns this contractor relationship. Contractors are city-scoped.
  city_id    uuid NOT NULL REFERENCES cities (id) ON DELETE CASCADE,
  name       text NOT NULL,
  -- email is the join key to auth.users — must match exactly (case-insensitive
  -- match is done in current_contractor_id() via LOWER()).
  email      text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractors_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_contractors_city_id ON contractors (city_id);
CREATE INDEX IF NOT EXISTS idx_contractors_email ON contractors (LOWER(email));

-- ---------------------------------------------------------------------------
-- 2. Add contractor_id FK to work_orders
-- ---------------------------------------------------------------------------
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES contractors (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_contractor_id ON work_orders (contractor_id)
  WHERE contractor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. current_contractor_id() — security-definer helper
--
-- Resolves the currently authenticated user's email to a contractors.id.
-- Returns NULL if:
--   • There is no authenticated session (auth.email() returns NULL)
--   • The email does not appear in the contractors table
--   • The contractor row has active = false
--
-- SECURITY DEFINER: runs as the function owner (postgres / service role), not
-- the calling role. This is intentional — contractors do not have SELECT on the
-- contractors table, but this function must read it to resolve the mapping.
-- The function reveals nothing: it only returns the caller's own id (or NULL).
--
-- search_path is pinned to `public` to prevent search_path injection attacks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_contractor_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM contractors
  WHERE LOWER(email) = LOWER(COALESCE(auth.email(), ''))
    AND active = true
  LIMIT 1;
$$;

-- Only authenticated users can call this; service_role already bypasses RLS.
GRANT EXECUTE ON FUNCTION public.current_contractor_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS — contractors table (admin/staff read-write only)
-- ---------------------------------------------------------------------------
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

-- Staff (includes admin) can read the full contractor list for their city.
DROP POLICY IF EXISTS contractors_staff_select ON contractors;
CREATE POLICY contractors_staff_select ON contractors
  FOR SELECT USING (is_staff());

-- Only admins may insert new contractors (creating a vendor relationship).
DROP POLICY IF EXISTS contractors_admin_insert ON contractors;
CREATE POLICY contractors_admin_insert ON contractors
  FOR INSERT WITH CHECK (is_admin());

-- Admins may update contractor rows (activate/deactivate, rename, reassign city).
DROP POLICY IF EXISTS contractors_admin_update ON contractors;
CREATE POLICY contractors_admin_update ON contractors
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- Admins may delete (hard-delete rare; prefer active=false).
DROP POLICY IF EXISTS contractors_admin_delete ON contractors;
CREATE POLICY contractors_admin_delete ON contractors
  FOR DELETE USING (is_admin());

-- NOTE: There is intentionally NO policy granting contractors SELECT/UPDATE on
-- this table. A contractor cannot enumerate peers or see who else is a vendor.

-- ---------------------------------------------------------------------------
-- 5. RLS — work_orders: add contractor-access policies
--
-- Existing staff/admin policies on work_orders are untouched. We add two new
-- policies (SELECT, UPDATE) keyed on current_contractor_id().
--
-- SELECT: contractor sees ONLY rows assigned to them (contractor_id matches
--   their resolved id). NULL contractor_id rows are invisible (COALESCE would
--   not help — we want strict equality, not a fallback).
--
-- UPDATE: same filter. Column whitelist is NOT enforced at the RLS layer
--   (Postgres RLS cannot restrict individual columns on UPDATE). Instead, the
--   server action updateWorkOrderProgress() uses the service-role client and
--   enforces the column whitelist explicitly before writing. Contractors must
--   authenticate through the server action; direct DB access with anon key
--   would be caught by the policy predicate (they can only UPDATE rows where
--   contractor_id = their own id, which the action verifies first).
-- ---------------------------------------------------------------------------

-- Contractors can SELECT their own assigned work orders.
DROP POLICY IF EXISTS work_orders_contractor_select ON work_orders;
CREATE POLICY work_orders_contractor_select ON work_orders
  FOR SELECT
  USING (
    contractor_id IS NOT NULL
    AND contractor_id = current_contractor_id()
  );

-- Contractors are intentionally granted NO direct UPDATE policy on work_orders.
--
-- Postgres RLS cannot restrict WHICH columns an UPDATE touches — only which
-- rows. A row-scoped contractor UPDATE policy would therefore let a contractor,
-- using their own authenticated key directly against PostgREST, overwrite STAFF
-- columns (priority_score, department, dispatched_at, …) on a work order that
-- happens to be assigned to them. The app never needs client-side writes: all
-- contractor progress updates go through the server action
-- updateWorkOrderProgress(), which runs as the service role and enforces
-- (a) ownership (contractor_id = current contractor) and (b) a strict column
-- whitelist (contractor_status/note/photo_url/updated_at only). Omitting the
-- UPDATE policy closes the column-tampering hole while the service-role action
-- remains the sole, audited writer.
DROP POLICY IF EXISTS work_orders_contractor_update ON work_orders;

-- ---------------------------------------------------------------------------
-- 6. Add contractor progress columns to work_orders
--
-- contractor_status: contractor's view of their assignment lifecycle.
--   Values: assigned | accepted | declined | in_progress | complete
--   Separate from the internal work_order status so staff can keep their
--   own workflow status while the contractor tracks their progress.
-- contractor_note: free-text progress note from the contractor.
-- contractor_photo_url: blurred/safe photo URL (public bucket only, same
--   policy as reports — the server action must enforce this).
-- contractor_updated_at: last time the contractor touched this row.
-- ---------------------------------------------------------------------------
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS contractor_status text
    CHECK (contractor_status IN ('assigned', 'accepted', 'declined', 'in_progress', 'complete')),
  ADD COLUMN IF NOT EXISTS contractor_note text,
  ADD COLUMN IF NOT EXISTS contractor_photo_url text,
  ADD COLUMN IF NOT EXISTS contractor_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 7. is_admin() helper (if not already defined by a prior migration)
--
-- Mirrors is_staff() pattern — checks the users table for role='admin'.
-- Using CREATE OR REPLACE so it is idempotent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

COMMIT;
