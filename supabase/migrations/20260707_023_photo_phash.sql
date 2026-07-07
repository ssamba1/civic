-- 023_photo_phash
--
-- Adds a perceptual hash column to reports so pre-submit duplicate detection
-- can compare images client-to-DB without a full round-trip upload.
--
-- photo_phash: 16-char hex string encoding a 64-bit average hash (aHash).
--   Computed client-side from the blurred WebP before upload and stored
--   alongside the report row. Null for legacy reports (no back-fill needed;
--   the scoring treats a missing hash as neutral 0.5).
--
-- find_nearby_open_reports: lightweight RPC called by checkPotentialDuplicate
--   before the user submits. Returns open/dispatched/in_progress reports
--   within _radius_m metres of the given coordinate in the last _window_days.
--   SECURITY DEFINER so it can read across city_id without exposing service key
--   to the client; returns only public columns (photo_public_url, address,
--   category, created_at, photo_phash, distance_m).
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Re-runnable: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS photo_phash text;

CREATE OR REPLACE FUNCTION public.find_nearby_open_reports(
  _lat       float8,
  _lng       float8,
  _radius_m  float8 DEFAULT 200,
  _window_days int   DEFAULT 30
)
RETURNS TABLE (
  id               uuid,
  photo_public_url text,
  address          text,
  created_at       timestamptz,
  photo_phash      text,
  category         text,
  distance_m       float8
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.photo_public_url,
    r.address,
    r.created_at,
    r.photo_phash,
    c.category::text,
    ST_Distance(
      r.location::geography,
      ST_MakePoint(_lng, _lat)::geography
    ) AS distance_m
  FROM reports r
  LEFT JOIN classifications c ON c.report_id = r.id
  WHERE r.status NOT IN ('merged', 'rejected')
    AND r.created_at > now() - (_window_days || ' days')::interval
    AND ST_DWithin(
      r.location::geography,
      ST_MakePoint(_lng, _lat)::geography,
      _radius_m
    )
  ORDER BY distance_m
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.find_nearby_open_reports(float8, float8, float8, int)
  TO authenticated, anon, service_role;
