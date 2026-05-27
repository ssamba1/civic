/**
 * Raw photo retention policy.
 *
 * Original (unblurred) photos are stored in `photos-raw` with a 30-day TTL.
 * Actual deletion is handled by a Supabase pg_cron scheduled function that
 * runs daily at 03:00 UTC.
 *
 * This module exports the constants and the SQL needed to set up the cron job.
 * The SQL should be run once via a Supabase migration.
 */

/** Maximum number of days raw photos are retained before deletion. */
export const RAW_PHOTO_TTL_DAYS = 30;

/** Cron schedule expression — daily at 03:00 UTC. */
export const RETENTION_CRON_SCHEDULE = "0 3 * * *";

/**
 * SQL migration to create the raw-photo cleanup cron job.
 *
 * Prerequisites:
 *  - `pg_cron` extension enabled (Supabase enables it by default on Pro+)
 *  - `storage.objects` table accessible (standard Supabase storage schema)
 *
 * The function:
 *  1. Finds all objects in the `photos-raw` bucket older than 30 days
 *  2. Deletes them from storage via `storage.delete_object`
 *  3. Logs the count of deleted objects
 *
 * Run this SQL as a Supabase migration:
 *   `supabase migration new raw_photo_retention`
 *   then paste the SQL into the generated file.
 */
export const RETENTION_CLEANUP_SQL = `
-- Enable pg_cron if not already enabled
create extension if not exists pg_cron with schema extensions;

-- Create the cleanup function
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
      and created_at < now() - interval '${RAW_PHOTO_TTL_DAYS} days'
  loop
    delete from storage.objects where id = obj.id;
    deleted_count := deleted_count + 1;
  end loop;

  raise log 'cleanup_expired_raw_photos: deleted % objects', deleted_count;
end;
$$;

-- Schedule the cron job (daily at 03:00 UTC)
select cron.schedule(
  'cleanup-expired-raw-photos',
  '${RETENTION_CRON_SCHEDULE}',
  $$ select public.cleanup_expired_raw_photos(); $$
);
`;
