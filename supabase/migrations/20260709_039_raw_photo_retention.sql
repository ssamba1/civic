-- 039 raw-photo retention TTL (OUTFLANK #34 finish)
-- Enforces the 30-day TTL on the photos-raw bucket that agents.md mandates but
-- which was, until now, code-only documentation (src/lib/privacy/retention.ts).
-- Content mirrors RETENTION_CLEANUP_SQL verbatim; keep the two in sync.
--
-- OWNER-APPLY ONLY. Unlike the analytics RPCs, this migration:
--   1. enables the pg_cron extension (a project-level change), and
--   2. schedules a RECURRING DELETE against storage.objects.
-- It was intentionally NOT auto-applied by the agent. Apply it deliberately
-- against a shadow project first, confirm the 30-day window is correct for the
-- deployment's records law, then apply to prod. Configurable per-city retention
-- (OUTFLANK #38) can later parameterize the interval.

create extension if not exists pg_cron with schema extensions;

create or replace function public.cleanup_expired_raw_photos()
returns void
language plpgsql
security definer
as $$
declare
  deleted_count int := 0;
  obj record;
begin
  for obj in
    select id, name
    from storage.objects
    where bucket_id = 'photos-raw'
      -- SQL uses literal 30 (= RAW_PHOTO_TTL_DAYS). Update both together if TTL changes.
      and created_at < now() - interval '30 days'
  loop
    delete from storage.objects where id = obj.id;
    deleted_count := deleted_count + 1;
  end loop;

  raise log 'cleanup_expired_raw_photos: deleted % objects', deleted_count;
end;
$$;

select cron.schedule(
  'cleanup-expired-raw-photos',
  -- Cron schedule literal (= RETENTION_CRON_SCHEDULE). Update both together if schedule changes.
  '0 3 * * *',
  $$ select public.cleanup_expired_raw_photos(); $$
);
