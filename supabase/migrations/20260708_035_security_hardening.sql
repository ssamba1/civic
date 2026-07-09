-- =============================================================================
-- Civic – Security hardening from Supabase advisor sweep (2026-07-08)
-- Migration: 20260708_035_security_hardening.sql
--
-- Addresses the SAFE, non-behavior-changing advisor findings. Three groups:
--
--   1. function_search_path_mutable (6 fns) — pin search_path so a caller-set
--      search_path can't shadow objects the SECURITY DEFINER body resolves.
--      ALTER FUNCTION (not CREATE OR REPLACE) — bodies untouched, no re-grant.
--
--   2. security_definer_function executable-by-anon/authenticated — revoke
--      EXECUTE from anon + authenticated on TRIGGER-ONLY functions (they run as
--      the table owner from the trigger regardless of grants, so RPC exposure is
--      pure attack surface) and on provision_city (invoked only via service_role
--      in the onboarding action; service_role keeps EXECUTE).
--      NOT revoked: is_staff / current_user_city_id / current_user_role — RLS
--      policies call these, so authenticated MUST retain EXECUTE or every policy
--      check errors. Their anon/authenticated exposure is intentional.
--
--   3. api_keys — RLS was enabled with zero policies (default-deny to all roles).
--      Add owner-scoped + staff-scoped SELECT. Writes stay service-role-only
--      (scripts/issue-api-key.mjs), which bypasses RLS — no write policy needed.
--
-- DELIBERATELY OUT OF SCOPE (need a decision, not a blind flip):
--   * 7 SECURITY DEFINER views (dashboard_reports_view + 6 metric_*). These are
--     definer ON PURPOSE: dashboard_reports_view is the anon public-dashboard
--     read path with PII (reporter_id/description) stripped, reading staff-only
--     classifications/work_orders. Switching to security_invoker would force anon
--     RLS on those tables and break the public dashboard. Left as-is.
--   * extension_in_public (postgis) — moving schemas is invasive on managed PG.
--   * auth_leaked_password_protection — dashboard toggle, not SQL.
--   * anon-accessible RLS policies on public read tables (cities/reports/…) —
--     intentional public data.
--
-- Applied in filesystem order by scripts/run-migrations.mjs (NOT auto-applied).
-- Idempotent throughout.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on the 6 flagged functions.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.set_updated_at()            SET search_path = public, pg_catalog;
ALTER FUNCTION public.current_user_city_id()      SET search_path = public, pg_catalog;
ALTER FUNCTION public.current_user_role()         SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_staff()                  SET search_path = public, pg_catalog;
ALTER FUNCTION public.audit_trigger_fn()          SET search_path = public, pg_catalog;
ALTER FUNCTION public.notify_report_status_change() SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 2. Revoke EXECUTE from anon + authenticated on trigger-only functions and
--    provision_city. These are never legitimately called via /rest/v1/rpc.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._evt_classification_created()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._evt_classification_overridden() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._evt_merge_created()             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._evt_report_created()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._evt_report_status_changed()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._evt_work_order_created()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._evt_work_order_milestones()     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn()               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_report_status_change()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                 FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.provision_city(text, text, text, jsonb, double precision, double precision, integer, text)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. api_keys RLS policies. Owner reads own keys; staff read keys in their city.
--    key_hash is a hash (never the raw key), so read exposure is limited, but
--    scoping keeps one tenant's key metadata out of another's reach.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS api_keys_select_owner ON api_keys;
CREATE POLICY api_keys_select_owner ON api_keys
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS api_keys_select_staff ON api_keys;
CREATE POLICY api_keys_select_staff ON api_keys
  FOR SELECT USING (
    is_staff()
    AND city_id IS NOT NULL
    AND city_id = current_user_city_id()
  );

COMMIT;
