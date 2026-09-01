-- 069 video-frame retention TTL
--
-- OWNER-APPLY ONLY, for the same two reasons as 039: it depends on the pg_cron
-- extension and it schedules a RECURRING DELETE against storage.objects. Apply
-- it deliberately (against a shadow project first), and confirm the window
-- suits the deployment's records-retention law before running it on prod.
-- 039 must be applied first; this migration only adds a second job.
--
-- WHY
-- `video-frames` holds full frames extracted from dashcam/RTSP footage. They
-- are ordinary street scenes, which means bystanders' faces and readable
-- licence plates, and unlike the resident path they are NOT blurred: the
-- resident pipeline blurs client-side before upload (agents.md hard rule 2),
-- while the video pipeline stores the frame as extracted so the evidence box
-- lines up with what the detector actually saw.
--
-- That is defensible for evidence, but only for as long as the evidence is
-- needed. The bucket is private and every read goes through getFrameUrl, which
-- requires staff for the city and issues a 10-minute signed URL scoped to the
-- city's own path prefix, so this is a RETENTION gap, not an exposure. What
-- was missing is the other half of the rule photos-raw already follows: raw
-- imagery does not live forever.
--
-- 90 days rather than 30, because a frame is the evidence behind a work order
-- and, through the liability path, potentially behind a contractor claim; a
-- 30-day window would delete the proof while the claim is still open. Revisit
-- alongside the per-city retention settings in migration 046.

create extension if not exists pg_cron with schema extensions;

create or replace function public.cleanup_expired_video_frames()
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
    where bucket_id = 'video-frames'
      -- Keep in sync with VIDEO_FRAME_TTL_DAYS in src/lib/video/config.ts.
      and created_at < now() - interval '90 days'
  loop
    delete from storage.objects where id = obj.id;
    deleted_count := deleted_count + 1;
  end loop;

  raise log 'cleanup_expired_video_frames: deleted % objects', deleted_count;
end;
$$;

-- Restrict, like every other definer function in this schema. Nothing in the
-- app calls this; pg_cron runs it as the job owner.
revoke execute on function public.cleanup_expired_video_frames() from public, anon, authenticated;
grant execute on function public.cleanup_expired_video_frames() to service_role;

-- 03:30, half an hour after the raw-photo job, so the two never contend.
select cron.schedule(
  'cleanup-expired-video-frames',
  '30 3 * * *',
  $$ select public.cleanup_expired_video_frames(); $$
);
