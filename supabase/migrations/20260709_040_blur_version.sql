-- 040 blur_version on reports (OUTFLANK #34 finish)
-- Persists which client-side blur pipeline version ran before a photo hit the
-- public bucket. Until now BLUR_VERSION (lib/privacy/blur.ts) was a constant
-- that was never recorded, so "what % of reports had blur applied" was
-- unanswerable. Nullable: legacy rows stay null (unknown), new submits stamp it.
-- Feeds the privacy-audit dashboard's blur-coverage metric.
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS blur_version integer;

COMMENT ON COLUMN public.reports.blur_version IS
  'Client-side blur pipeline version applied before public-bucket upload (lib/privacy/blur.ts BLUR_VERSION). NULL = pre-tracking / unknown.';
