-- =============================================================================
-- Civic, Storage RLS path scoping (T1.13)
-- Migration: 20260702_022_storage_path_scoping.sql
--
-- Migration 003 granted authenticated INSERT on the photos-public / photos-raw
-- buckets with only WITH CHECK (bucket_id = '...'). No folder constraint. Any
-- authenticated user could therefore upload into ANY city's folder using their
-- own JWT. Tighten both policies so the first path segment (the city id in the
-- `${cityId}/${reportId}.ext` object name) must equal the caller's own city.
--
-- The app's own uploads run under the service-role key (RLS-exempt), so this
-- does NOT affect normal report submission; it closes the direct-JWT abuse path
-- and satisfies the tests/rls storage invariant.
--
-- current_user_city_id() (migration 001) returns the caller's city_id (uuid);
-- storage.foldername(name) returns the path segments, [1] being the first.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can upload blurred photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload blurred photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos-public'
  AND (storage.foldername(name))[1] = current_user_city_id()::text
);

DROP POLICY IF EXISTS "Authenticated users can upload raw photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload raw photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos-raw'
  AND (storage.foldername(name))[1] = current_user_city_id()::text
);

COMMIT;
