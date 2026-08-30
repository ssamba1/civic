-- =============================================================================
-- Civic – Storage RLS, Audit Trigger Fix, Dashboard View PII Fix
-- Migration: 20260527_003_storage_rls_and_fixes.sql
--
-- Fixes:
--   C10  — Storage RLS: add policies on storage.objects for photos-raw /
--          photos-public buckets (previously no policies existed).
--   M5   — Audit trigger: auth.uid() returns null for service-role ops;
--          fall back to a sentinel UUID so logs remain forensically useful.
--   M10  — dashboard_reports_view: exclude `description` (user-typed free
--          text that may contain reporter PII such as names or addresses).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- C10. Storage RLS policies on storage.objects
-- ---------------------------------------------------------------------------

-- RLS is managed by Supabase on storage.objects; the ALTER is idempotent.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read photos from the public bucket.
CREATE POLICY "Public photos are readable by all"
ON storage.objects FOR SELECT
USING (bucket_id = 'photos-public');

-- Only authenticated staff/admin can read raw (unblurred) photos.
CREATE POLICY "Raw photos readable by staff only"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'photos-raw'
  AND (
    SELECT role FROM public.users WHERE id = auth.uid()
  ) IN ('staff_dispatcher', 'staff_supervisor', 'admin')
);

-- Authenticated users can upload blurred photos (insert to public bucket).
CREATE POLICY "Authenticated users can upload blurred photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos-public');

-- Authenticated users can upload original photos (insert to raw bucket).
CREATE POLICY "Authenticated users can upload raw photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos-raw');

-- ---------------------------------------------------------------------------
-- M5. Audit trigger: COALESCE(auth.uid(), sentinel) for service-role ops
--
-- The existing function is named audit_trigger_fn() (001 migration).
-- We replace it in-place so the triggers attached to reports and work_orders
-- pick up the fix without being recreated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    -- auth.uid() is NULL when called from the service-role key (server-side ops).
    -- Use a fixed sentinel UUID so every audit row has a non-null user_id and
    -- server-side writes are clearly distinguishable from unauthenticated gaps.
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- M10. dashboard_reports_view: drop `description` to prevent PII leakage
--
-- `description` is user-typed free text and may contain reporter PII
-- (e.g. full names, addresses, phone numbers). The public dashboard view
-- has no legitimate need for it. All other columns are preserved.
-- ---------------------------------------------------------------------------
-- DROP + CREATE, not CREATE OR REPLACE: this statement REMOVES `description`
-- from the view, and Postgres refuses to drop a column through
-- CREATE OR REPLACE VIEW ("cannot drop columns from view"). The file is
-- transactional, so that error rolled back all of 003 on a fresh database —
-- taking the storage RLS fixes AND this very PII protection with it, while the
-- already-migrated live project stayed fine. Migration 009 uses this same
-- DROP-then-CREATE shape on the same view.
DROP VIEW IF EXISTS dashboard_reports_view;
CREATE VIEW dashboard_reports_view AS
SELECT
  r.id,
  r.city_id,
  c_city.slug   AS city_slug,
  c_city.name   AS city_name,
  r.location,
  r.photo_public_url,
  r.status,
  r.address,
  -- description intentionally excluded: may contain reporter PII
  r.created_at,
  r.updated_at,
  cl.category,
  cl.subcategory,
  cl.severity,
  cl.hazard_radius_m,
  cl.visible_size_estimate,
  cl.is_emergency,
  cl.confidence
FROM reports r
LEFT JOIN classifications cl ON cl.report_id = r.id
LEFT JOIN cities c_city ON c_city.id = r.city_id
WHERE r.status NOT IN ('rejected');

-- Re-grant access (CREATE OR REPLACE VIEW resets grants in some PG versions).
GRANT SELECT ON dashboard_reports_view TO anon, authenticated;

COMMIT;
