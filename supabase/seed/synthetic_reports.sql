-- =============================================================================
-- Civic, Synthetic report seed (120 reports for Cumming, GA)
-- Generated from buildCorpus() in src/lib/dashboard-data.ts.
-- Paste into the Supabase SQL editor and Run.
--
-- Notes:
--   * Resolves the target city ('cumming') and an existing reporter user from
--     rows already in the DB. Run the base seed (city + users) first.
--   * Inserts into reports + classifications (the tables every dashboard /
--     analytics / map widget derives from). lng/lat come from the location
--     POINT via the dashboard_reports_view; upvote_count defaults to 0.
--   * Reports use random UUIDs, so re-running ADDS another 120. Run once.
--     To wipe a previous run of this seed first, see the DELETE at the bottom
--     (commented out).
-- =============================================================================

DO $$
DECLARE
  v_city_id   uuid;
  v_reporter  uuid;
  v_report_id uuid;
BEGIN
  SELECT id INTO v_city_id FROM public.cities WHERE slug = 'cumming';
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'City "cumming" not found. Seed the city first.';
  END IF;

  -- Prefer a resident; fall back to any user in the city.
  SELECT id INTO v_reporter
    FROM public.users
   WHERE city_id = v_city_id
   ORDER BY (role = 'resident') DESC
   LIMIT 1;
  IF v_reporter IS NULL THEN
    RAISE EXCEPTION 'No user found for the city. Run the base seed (users) first.';
  END IF;

  --   1  tree_down / sev 2 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.122560 34.194446)', 'https://picsum.photos/seed/tree_down-0/640/360', 'dispatched', '664 Peachtree Rd', '2026-05-28T21:33:13.457Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 2, false, 0.90, 'synthetic-seed-v1');

  --   2  pothole / sev 3 / open
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.122445 34.221915)', 'https://picsum.photos/seed/pothole-1/640/360', 'open', '285 Birch St', '2026-05-26T20:45:28.826Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --   3  graffiti / sev 4 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142721 34.213637)', 'https://picsum.photos/seed/graffiti-2/640/360', 'dispatched', '586 Oak Dr', '2026-05-25T05:55:38.075Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 4, false, 0.90, 'synthetic-seed-v1');

  --   4  sidewalk_damage / sev 4 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.154684 34.201189)', 'https://picsum.photos/seed/sidewalk_damage-3/640/360', 'in_progress', '641 Birch St', '2026-05-23T03:45:11.555Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 4, false, 0.90, 'synthetic-seed-v1');

  --   5  graffiti / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.136472 34.231083)', 'https://picsum.photos/seed/graffiti-4/640/360', 'closed', '119 Cedar Blvd', '2026-05-21T17:12:38.245Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 3, false, 0.90, 'synthetic-seed-v1');

  --   6  sidewalk_damage / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.120784 34.230226)', 'https://picsum.photos/seed/sidewalk_damage-5/640/360', 'closed', '191 Magnolia Ct', '2026-05-20T23:02:54.542Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 4, false, 0.90, 'synthetic-seed-v1');

  --   7  faded_signage / sev 3 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.154344 34.216449)', 'https://picsum.photos/seed/faded_signage-6/640/360', 'dispatched', '149 Redwood Dr', '2026-05-19T21:29:01.781Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'faded_signage', 3, false, 0.90, 'synthetic-seed-v1');

  --   8  drainage / sev 4 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.117744 34.191630)', 'https://picsum.photos/seed/drainage-7/640/360', 'in_progress', '262 Elm Ave', '2026-05-18T10:13:07.370Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 4, false, 0.90, 'synthetic-seed-v1');

  --   9  tree_down / sev 3 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.120605 34.227761)', 'https://picsum.photos/seed/tree_down-8/640/360', 'in_progress', '923 Dogwood Blvd', '2026-05-17T01:38:57.745Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 3, false, 0.90, 'synthetic-seed-v1');

  --  10  illegal_dump / sev 4 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142421 34.211142)', 'https://picsum.photos/seed/illegal_dump-9/640/360', 'dispatched', '421 Sycamore St', '2026-05-15T11:19:11.879Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'illegal_dump', 4, false, 0.90, 'synthetic-seed-v1');

  --  11  graffiti / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.156096 34.223105)', 'https://picsum.photos/seed/graffiti-10/640/360', 'closed', '268 Pine Way', '2026-05-13T05:01:17.862Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 2, false, 0.90, 'synthetic-seed-v1');

  --  12  sidewalk_damage / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.119010 34.193383)', 'https://picsum.photos/seed/sidewalk_damage-11/640/360', 'closed', '311 Aspen Ave', '2026-05-11T04:44:32.085Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 4, false, 0.90, 'synthetic-seed-v1');

  --  13  pothole / sev 3 / rejected
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.145086 34.201091)', 'https://picsum.photos/seed/pothole-12/640/360', 'rejected', '256 Magnolia Ct', '2026-05-10T09:43:44.201Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  14  illegal_dump / sev 4 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.123644 34.199487)', 'https://picsum.photos/seed/illegal_dump-13/640/360', 'dispatched', '578 Maple Ln', '2026-05-09T04:10:19.973Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'illegal_dump', 4, false, 0.90, 'synthetic-seed-v1');

  --  15  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.119628 34.206306)', 'https://picsum.photos/seed/pothole-14/640/360', 'closed', '638 Aspen Ave', '2026-05-07T05:23:55.958Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  16  tree_down / sev 1 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.123542 34.194054)', 'https://picsum.photos/seed/tree_down-15/640/360', 'closed', '845 Chestnut Way', '2026-05-06T06:57:02.808Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 1, false, 0.90, 'synthetic-seed-v1');

  --  17  pothole / sev 3 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.144300 34.197434)', 'https://picsum.photos/seed/pothole-16/640/360', 'in_progress', '377 Dogwood Blvd', '2026-05-04T08:01:19.257Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  18  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.117589 34.211512)', 'https://picsum.photos/seed/pothole-17/640/360', 'closed', '165 Aspen Ave', '2026-05-02T04:54:07.709Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  19  illegal_dump / sev 3 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.143194 34.196737)', 'https://picsum.photos/seed/illegal_dump-18/640/360', 'in_progress', '539 Birch St', '2026-05-01T05:07:32.179Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'illegal_dump', 3, false, 0.90, 'synthetic-seed-v1');

  --  20  pothole / sev 5 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.146540 34.218905)', 'https://picsum.photos/seed/pothole-19/640/360', 'in_progress', '257 Birch St', '2026-04-29T05:59:14.440Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 5, false, 0.90, 'synthetic-seed-v1');

  --  21  downed_sign / sev 3 / open
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.133992 34.224495)', 'https://picsum.photos/seed/downed_sign-20/640/360', 'open', '200 Spruce Dr', '2026-04-28T04:19:50.927Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 3, false, 0.90, 'synthetic-seed-v1');

  --  22  pothole / sev 4 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.145137 34.195197)', 'https://picsum.photos/seed/pothole-21/640/360', 'in_progress', '479 Maple Ln', '2026-04-27T07:59:42.530Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 4, false, 0.90, 'synthetic-seed-v1');

  --  23  streetlight / sev 3 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.161482 34.205664)', 'https://picsum.photos/seed/streetlight-22/640/360', 'dispatched', '223 Oak Dr', '2026-04-26T02:13:22.477Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  --  24  tree_down / sev 4 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.157311 34.230457)', 'https://picsum.photos/seed/tree_down-23/640/360', 'dispatched', '566 Pine Way', '2026-04-24T00:45:58.040Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 4, false, 0.90, 'synthetic-seed-v1');

  --  25  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.160348 34.211824)', 'https://picsum.photos/seed/pothole-24/640/360', 'closed', '976 Elm Ave', '2026-04-21T14:39:43.276Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  26  water_leak / sev 3 / open
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.125634 34.192915)', 'https://picsum.photos/seed/water_leak-25/640/360', 'open', '222 Elm Ave', '2026-04-20T12:19:59.919Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 3, false, 0.90, 'synthetic-seed-v1');

  --  27  sidewalk_damage / sev 2 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.156518 34.215342)', 'https://picsum.photos/seed/sidewalk_damage-26/640/360', 'dispatched', '415 Walnut Ct', '2026-04-19T00:27:28.722Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 2, false, 0.90, 'synthetic-seed-v1');

  --  28  water_leak / sev 4 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.129377 34.196831)', 'https://picsum.photos/seed/water_leak-27/640/360', 'in_progress', '567 Dogwood Blvd', '2026-04-17T16:21:44.657Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 4, false, 0.90, 'synthetic-seed-v1');

  --  29  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142030 34.217241)', 'https://picsum.photos/seed/pothole-28/640/360', 'closed', '792 Birch St', '2026-04-16T13:36:05.986Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  30  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.125970 34.187145)', 'https://picsum.photos/seed/pothole-29/640/360', 'closed', '541 Hickory Rd', '2026-04-14T17:12:00.285Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  31  streetlight / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.137151 34.191037)', 'https://picsum.photos/seed/streetlight-30/640/360', 'closed', '521 Magnolia Ct', '2026-04-12T18:54:15.833Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  --  32  sidewalk_damage / sev 5 / open
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.140899 34.220360)', 'https://picsum.photos/seed/sidewalk_damage-31/640/360', 'open', '819 Birch St', '2026-04-11T08:03:25.171Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 5, false, 0.90, 'synthetic-seed-v1');

  --  33  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.156317 34.188328)', 'https://picsum.photos/seed/pothole-32/640/360', 'closed', '731 Sycamore St', '2026-04-10T04:21:28.848Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  34  streetlight / sev 3 / dispatched
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.128361 34.188629)', 'https://picsum.photos/seed/streetlight-33/640/360', 'dispatched', '799 Sycamore St', '2026-04-08T03:30:26.527Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  --  35  downed_sign / sev 3 / in_progress
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.133963 34.230112)', 'https://picsum.photos/seed/downed_sign-34/640/360', 'in_progress', '799 Walnut Ct', '2026-04-06T19:57:22.552Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 3, false, 0.90, 'synthetic-seed-v1');

  --  36  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142916 34.198118)', 'https://picsum.photos/seed/pothole-35/640/360', 'closed', '124 Birch St', '2026-04-06T10:18:58.412Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  37  faded_signage / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.137340 34.190119)', 'https://picsum.photos/seed/faded_signage-36/640/360', 'closed', '378 Poplar Ln', '2026-04-04T22:26:00.692Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'faded_signage', 2, false, 0.90, 'synthetic-seed-v1');

  --  38  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.159866 34.198910)', 'https://picsum.photos/seed/pothole-37/640/360', 'closed', '451 Magnolia Ct', '2026-04-03T06:11:52.332Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  39  streetlight / sev 3 / rejected
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.158032 34.216355)', 'https://picsum.photos/seed/streetlight-38/640/360', 'rejected', '223 Oak Dr', '2026-04-01T23:40:46.618Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  --  40  drainage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.144292 34.206799)', 'https://picsum.photos/seed/drainage-39/640/360', 'closed', '825 Dogwood Blvd', '2026-03-31T11:51:08.412Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 3, false, 0.90, 'synthetic-seed-v1');

  --  41  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.143214 34.196387)', 'https://picsum.photos/seed/pothole-40/640/360', 'closed', '956 Elm Ave', '2026-03-29T02:08:02.273Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  42  sidewalk_damage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.161012 34.225443)', 'https://picsum.photos/seed/sidewalk_damage-41/640/360', 'closed', '300 Chestnut Way', '2026-03-28T03:45:58.150Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 3, false, 0.90, 'synthetic-seed-v1');

  --  43  streetlight / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.155448 34.223866)', 'https://picsum.photos/seed/streetlight-42/640/360', 'closed', '849 Peachtree Rd', '2026-03-26T09:33:56.876Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  --  44  water_leak / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.149795 34.224440)', 'https://picsum.photos/seed/water_leak-43/640/360', 'closed', '809 Redwood Dr', '2026-03-24T03:41:02.451Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 5, false, 0.90, 'synthetic-seed-v1');

  --  45  water_leak / sev 1 / rejected
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.150201 34.213470)', 'https://picsum.photos/seed/water_leak-44/640/360', 'rejected', '844 Redwood Dr', '2026-03-23T16:57:45.564Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 1, false, 0.90, 'synthetic-seed-v1');

  --  46  downed_sign / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.139279 34.211070)', 'https://picsum.photos/seed/downed_sign-45/640/360', 'closed', '788 Aspen Ave', '2026-03-21T18:07:52.836Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 5, false, 0.90, 'synthetic-seed-v1');

  --  47  sidewalk_damage / sev 3 / rejected
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.153292 34.192287)', 'https://picsum.photos/seed/sidewalk_damage-46/640/360', 'rejected', '848 Willow Ave', '2026-03-20T05:01:40.448Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 3, false, 0.90, 'synthetic-seed-v1');

  --  48  water_leak / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.150523 34.205653)', 'https://picsum.photos/seed/water_leak-47/640/360', 'closed', '929 Magnolia Ct', '2026-03-19T11:36:36.074Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 2, false, 0.90, 'synthetic-seed-v1');

  --  49  pothole / sev 1 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.163795 34.217209)', 'https://picsum.photos/seed/pothole-48/640/360', 'closed', '766 Cedar Blvd', '2026-03-17T04:27:13.976Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 1, false, 0.90, 'synthetic-seed-v1');

  --  50  sidewalk_damage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.123087 34.214585)', 'https://picsum.photos/seed/sidewalk_damage-49/640/360', 'closed', '962 Juniper Rd', '2026-03-15T15:59:38.501Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 3, false, 0.90, 'synthetic-seed-v1');

  --  51  pothole / sev 4 / merged
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142278 34.192392)', 'https://picsum.photos/seed/pothole-50/640/360', 'merged', '874 Birch St', '2026-03-15T01:43:57.291Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 4, false, 0.90, 'synthetic-seed-v1');

  --  52  water_leak / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.129171 34.192589)', 'https://picsum.photos/seed/water_leak-51/640/360', 'closed', '496 Spruce Dr', '2026-03-13T01:08:30.305Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 3, false, 0.90, 'synthetic-seed-v1');

  --  53  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.126043 34.215697)', 'https://picsum.photos/seed/pothole-52/640/360', 'closed', '919 Pine Way', '2026-03-10T16:44:00.473Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  54  streetlight / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.146751 34.205618)', 'https://picsum.photos/seed/streetlight-53/640/360', 'closed', '342 Cedar Blvd', '2026-03-10T05:22:28.551Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 4, false, 0.90, 'synthetic-seed-v1');

  --  55  debris / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.143827 34.218974)', 'https://picsum.photos/seed/debris-54/640/360', 'closed', '208 Maple Ln', '2026-03-07T15:31:14.929Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'debris', 5, false, 0.90, 'synthetic-seed-v1');

  --  56  pothole / sev 1 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.162306 34.225785)', 'https://picsum.photos/seed/pothole-55/640/360', 'closed', '705 Willow Ave', '2026-03-07T13:52:16.535Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 1, false, 0.90, 'synthetic-seed-v1');

  --  57  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.136877 34.190300)', 'https://picsum.photos/seed/pothole-56/640/360', 'closed', '326 Dogwood Blvd', '2026-03-05T12:54:33.412Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  58  water_leak / sev 4 / merged
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.126494 34.217362)', 'https://picsum.photos/seed/water_leak-57/640/360', 'merged', '918 Pine Way', '2026-03-04T03:38:10.596Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 4, false, 0.90, 'synthetic-seed-v1');

  --  59  streetlight / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.149915 34.193077)', 'https://picsum.photos/seed/streetlight-58/640/360', 'closed', '384 Juniper Rd', '2026-03-02T13:10:36.943Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 2, false, 0.90, 'synthetic-seed-v1');

  --  60  drainage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.122771 34.200446)', 'https://picsum.photos/seed/drainage-59/640/360', 'closed', '501 Sycamore St', '2026-03-01T02:59:39.891Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 3, false, 0.90, 'synthetic-seed-v1');

  --  61  water_leak / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.161051 34.223750)', 'https://picsum.photos/seed/water_leak-60/640/360', 'closed', '954 Main St', '2026-02-27T21:35:21.336Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 4, false, 0.90, 'synthetic-seed-v1');

  --  62  downed_sign / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.133862 34.211771)', 'https://picsum.photos/seed/downed_sign-61/640/360', 'closed', '800 Dogwood Blvd', '2026-02-26T06:56:27.541Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 3, false, 0.90, 'synthetic-seed-v1');

  --  63  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.119844 34.217439)', 'https://picsum.photos/seed/pothole-62/640/360', 'closed', '885 Oak Dr', '2026-02-24T05:28:38.866Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  64  tree_down / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.152036 34.202657)', 'https://picsum.photos/seed/tree_down-63/640/360', 'closed', '555 Sycamore St', '2026-02-22T05:37:21.964Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 3, false, 0.90, 'synthetic-seed-v1');

  --  65  sidewalk_damage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.120391 34.221685)', 'https://picsum.photos/seed/sidewalk_damage-64/640/360', 'closed', '308 Juniper Rd', '2026-02-21T10:16:40.221Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 3, false, 0.90, 'synthetic-seed-v1');

  --  66  downed_sign / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.125456 34.223492)', 'https://picsum.photos/seed/downed_sign-65/640/360', 'closed', '441 Peachtree Rd', '2026-02-20T06:43:13.245Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 3, false, 0.90, 'synthetic-seed-v1');

  --  67  drainage / sev 1 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.158743 34.209019)', 'https://picsum.photos/seed/drainage-66/640/360', 'closed', '906 Peachtree Rd', '2026-02-17T17:40:31.984Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 1, false, 0.90, 'synthetic-seed-v1');

  --  68  downed_sign / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.125898 34.192031)', 'https://picsum.photos/seed/downed_sign-67/640/360', 'closed', '493 Willow Ave', '2026-02-16T17:42:46.388Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 4, false, 0.90, 'synthetic-seed-v1');

  --  69  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.151324 34.193649)', 'https://picsum.photos/seed/pothole-68/640/360', 'closed', '287 Main St', '2026-02-16T01:15:28.917Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  70  water_leak / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.120534 34.216890)', 'https://picsum.photos/seed/water_leak-69/640/360', 'closed', '894 Birch St', '2026-02-14T04:19:07.864Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 2, false, 0.90, 'synthetic-seed-v1');

  --  71  drainage / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.123665 34.201460)', 'https://picsum.photos/seed/drainage-70/640/360', 'closed', '237 Walnut Ct', '2026-02-12T05:54:39.714Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 2, false, 0.90, 'synthetic-seed-v1');

  --  72  downed_sign / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.119281 34.203138)', 'https://picsum.photos/seed/downed_sign-71/640/360', 'closed', '471 Poplar Ln', '2026-02-10T09:25:30.939Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 4, false, 0.90, 'synthetic-seed-v1');

  --  73  drainage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.159778 34.183658)', 'https://picsum.photos/seed/drainage-72/640/360', 'closed', '322 Aspen Ave', '2026-02-09T20:34:17.062Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 3, false, 0.90, 'synthetic-seed-v1');

  --  74  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.154587 34.199439)', 'https://picsum.photos/seed/pothole-73/640/360', 'closed', '707 Oak Dr', '2026-02-08T07:38:07.658Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  75  pothole / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.132396 34.187309)', 'https://picsum.photos/seed/pothole-74/640/360', 'closed', '867 Cedar Blvd', '2026-02-06T18:44:38.503Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 4, false, 0.90, 'synthetic-seed-v1');

  --  76  downed_sign / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.119150 34.231044)', 'https://picsum.photos/seed/downed_sign-75/640/360', 'closed', '883 Juniper Rd', '2026-02-04T05:15:25.382Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 2, false, 0.90, 'synthetic-seed-v1');

  --  77  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.126928 34.222266)', 'https://picsum.photos/seed/pothole-76/640/360', 'closed', '890 Spruce Dr', '2026-02-03T19:27:48.936Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  78  downed_sign / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.145589 34.197217)', 'https://picsum.photos/seed/downed_sign-77/640/360', 'closed', '350 Elm Ave', '2026-02-01T11:24:01.292Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 2, false, 0.90, 'synthetic-seed-v1');

  --  79  drainage / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.136730 34.195244)', 'https://picsum.photos/seed/drainage-78/640/360', 'closed', '448 Elm Ave', '2026-01-31T11:18:56.395Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 5, false, 0.90, 'synthetic-seed-v1');

  --  80  tree_down / sev 3 / rejected
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.159084 34.219743)', 'https://picsum.photos/seed/tree_down-79/640/360', 'rejected', '729 Juniper Rd', '2026-01-29T15:10:56.240Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 3, false, 0.90, 'synthetic-seed-v1');

  --  81  streetlight / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.152141 34.213095)', 'https://picsum.photos/seed/streetlight-80/640/360', 'closed', '511 Birch St', '2026-01-27T21:18:29.620Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 5, false, 0.90, 'synthetic-seed-v1');

  --  82  drainage / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.133558 34.191015)', 'https://picsum.photos/seed/drainage-81/640/360', 'closed', '810 Pine Way', '2026-01-26T07:43:39.702Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 4, false, 0.90, 'synthetic-seed-v1');

  --  83  drainage / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.137541 34.208980)', 'https://picsum.photos/seed/drainage-82/640/360', 'closed', '687 Dogwood Blvd', '2026-01-25T05:38:04.978Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 3, false, 0.90, 'synthetic-seed-v1');

  --  84  other / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.121896 34.186774)', 'https://picsum.photos/seed/other-83/640/360', 'closed', '866 Aspen Ave', '2026-01-23T17:46:39.747Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'other', 3, false, 0.90, 'synthetic-seed-v1');

  --  85  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.135832 34.211181)', 'https://picsum.photos/seed/pothole-84/640/360', 'closed', '379 Sycamore St', '2026-01-22T01:56:36.230Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  86  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.136682 34.187752)', 'https://picsum.photos/seed/pothole-85/640/360', 'closed', '749 Sycamore St', '2026-01-20T04:57:14.516Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  87  graffiti / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.159104 34.211501)', 'https://picsum.photos/seed/graffiti-86/640/360', 'closed', '581 Chestnut Way', '2026-01-19T17:57:08.648Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 4, false, 0.90, 'synthetic-seed-v1');

  --  88  illegal_dump / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.122914 34.229229)', 'https://picsum.photos/seed/illegal_dump-87/640/360', 'closed', '261 Juniper Rd', '2026-01-18T10:23:14.069Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'illegal_dump', 4, false, 0.90, 'synthetic-seed-v1');

  --  89  downed_sign / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.150141 34.228377)', 'https://picsum.photos/seed/downed_sign-88/640/360', 'closed', '283 Spruce Dr', '2026-01-15T16:16:33.201Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 5, false, 0.90, 'synthetic-seed-v1');

  --  90  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.139778 34.200544)', 'https://picsum.photos/seed/pothole-89/640/360', 'closed', '467 Elm Ave', '2026-01-14T16:31:31.412Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  91  graffiti / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142429 34.221109)', 'https://picsum.photos/seed/graffiti-90/640/360', 'closed', '913 Birch St', '2026-01-13T16:54:31.229Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 3, false, 0.90, 'synthetic-seed-v1');

  --  92  water_leak / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142775 34.215177)', 'https://picsum.photos/seed/water_leak-91/640/360', 'closed', '927 Peachtree Rd', '2026-01-12T06:10:17.592Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 3, false, 0.90, 'synthetic-seed-v1');

  --  93  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.143494 34.230138)', 'https://picsum.photos/seed/pothole-92/640/360', 'closed', '311 Pine Way', '2026-01-09T17:12:33.760Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  --  94  graffiti / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.116557 34.209340)', 'https://picsum.photos/seed/graffiti-93/640/360', 'closed', '240 Spruce Dr', '2026-01-08T19:43:08.765Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 3, false, 0.90, 'synthetic-seed-v1');

  --  95  debris / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.122243 34.189504)', 'https://picsum.photos/seed/debris-94/640/360', 'closed', '197 Oak Dr', '2026-01-07T23:14:53.323Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'debris', 2, false, 0.90, 'synthetic-seed-v1');

  --  96  sidewalk_damage / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.136366 34.213933)', 'https://picsum.photos/seed/sidewalk_damage-95/640/360', 'closed', '793 Peachtree Rd', '2026-01-05T20:24:05.876Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 4, false, 0.90, 'synthetic-seed-v1');

  --  97  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.131784 34.209735)', 'https://picsum.photos/seed/pothole-96/640/360', 'closed', '357 Willow Ave', '2026-01-04T08:15:54.244Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  --  98  tree_down / sev 1 / merged
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.163059 34.218237)', 'https://picsum.photos/seed/tree_down-97/640/360', 'merged', '317 Oak Dr', '2026-01-02T18:52:15.017Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'tree_down', 1, false, 0.90, 'synthetic-seed-v1');

  --  99  water_leak / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.129863 34.229226)', 'https://picsum.photos/seed/water_leak-98/640/360', 'closed', '907 Elm Ave', '2026-01-01T12:31:56.782Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 3, false, 0.90, 'synthetic-seed-v1');

  -- 100  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.162309 34.191072)', 'https://picsum.photos/seed/pothole-99/640/360', 'closed', '878 Main St', '2025-12-31T03:51:07.125Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  -- 101  drainage / sev 5 / rejected
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.158677 34.223067)', 'https://picsum.photos/seed/drainage-100/640/360', 'rejected', '887 Poplar Ln', '2025-12-28T18:07:33.052Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 5, false, 0.90, 'synthetic-seed-v1');

  -- 102  pothole / sev 2 / merged
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.128264 34.206013)', 'https://picsum.photos/seed/pothole-101/640/360', 'merged', '331 Juniper Rd', '2025-12-28T11:28:09.541Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  -- 103  downed_sign / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.133602 34.217976)', 'https://picsum.photos/seed/downed_sign-102/640/360', 'closed', '450 Oak Dr', '2025-12-25T16:06:26.712Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'downed_sign', 2, false, 0.90, 'synthetic-seed-v1');

  -- 104  pothole / sev 1 / merged
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.123962 34.196299)', 'https://picsum.photos/seed/pothole-103/640/360', 'merged', '249 Pine Way', '2025-12-24T08:28:34.375Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 1, false, 0.90, 'synthetic-seed-v1');

  -- 105  sidewalk_damage / sev 5 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.129231 34.193663)', 'https://picsum.photos/seed/sidewalk_damage-104/640/360', 'closed', '920 Poplar Ln', '2025-12-23T08:31:33.271Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'sidewalk_damage', 5, false, 0.90, 'synthetic-seed-v1');

  -- 106  streetlight / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.160674 34.204489)', 'https://picsum.photos/seed/streetlight-105/640/360', 'closed', '100 Dogwood Blvd', '2025-12-21T20:29:13.774Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 4, false, 0.90, 'synthetic-seed-v1');

  -- 107  streetlight / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.116437 34.213203)', 'https://picsum.photos/seed/streetlight-106/640/360', 'closed', '566 Spruce Dr', '2025-12-20T05:39:47.561Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 4, false, 0.90, 'synthetic-seed-v1');

  -- 108  streetlight / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.142639 34.215928)', 'https://picsum.photos/seed/streetlight-107/640/360', 'closed', '202 Magnolia Ct', '2025-12-19T00:52:48.267Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  -- 109  graffiti / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.144226 34.198221)', 'https://picsum.photos/seed/graffiti-108/640/360', 'closed', '291 Birch St', '2025-12-17T15:38:44.683Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'graffiti', 2, false, 0.90, 'synthetic-seed-v1');

  -- 110  water_leak / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.148571 34.220508)', 'https://picsum.photos/seed/water_leak-109/640/360', 'closed', '241 Elm Ave', '2025-12-16T02:03:36.648Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 2, false, 0.90, 'synthetic-seed-v1');

  -- 111  streetlight / sev 1 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.144657 34.190386)', 'https://picsum.photos/seed/streetlight-110/640/360', 'closed', '871 Pine Way', '2025-12-14T20:26:22.325Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 1, false, 0.90, 'synthetic-seed-v1');

  -- 112  pothole / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.148320 34.207076)', 'https://picsum.photos/seed/pothole-111/640/360', 'closed', '123 Walnut Ct', '2025-12-12T08:24:27.005Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 2, false, 0.90, 'synthetic-seed-v1');

  -- 113  pothole / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.136165 34.207533)', 'https://picsum.photos/seed/pothole-112/640/360', 'closed', '567 Dogwood Blvd', '2025-12-10T15:39:19.349Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 4, false, 0.90, 'synthetic-seed-v1');

  -- 114  drainage / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.129177 34.187975)', 'https://picsum.photos/seed/drainage-113/640/360', 'closed', '736 Walnut Ct', '2025-12-10T00:41:41.970Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'drainage', 4, false, 0.90, 'synthetic-seed-v1');

  -- 115  pothole / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.121011 34.230059)', 'https://picsum.photos/seed/pothole-114/640/360', 'closed', '971 Main St', '2025-12-08T18:05:10.640Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 3, false, 0.90, 'synthetic-seed-v1');

  -- 116  water_leak / sev 4 / merged
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.146896 34.229403)', 'https://picsum.photos/seed/water_leak-115/640/360', 'merged', '339 Redwood Dr', '2025-12-07T02:25:49.546Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 4, false, 0.90, 'synthetic-seed-v1');

  -- 117  water_leak / sev 2 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.155923 34.189532)', 'https://picsum.photos/seed/water_leak-116/640/360', 'closed', '201 Hickory Rd', '2025-12-05T00:42:05.426Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 2, false, 0.90, 'synthetic-seed-v1');

  -- 118  water_leak / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.153956 34.210841)', 'https://picsum.photos/seed/water_leak-117/640/360', 'closed', '427 Redwood Dr', '2025-12-03T03:53:14.299Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'water_leak', 3, false, 0.90, 'synthetic-seed-v1');

  -- 119  pothole / sev 4 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.141781 34.204158)', 'https://picsum.photos/seed/pothole-118/640/360', 'closed', '874 Aspen Ave', '2025-12-02T20:18:23.047Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'pothole', 4, false, 0.90, 'synthetic-seed-v1');

  -- 120  streetlight / sev 3 / closed
  INSERT INTO public.reports
    (city_id, reporter_id, location, photo_public_url, status, address, created_at)
  VALUES
    (v_city_id, v_reporter, 'SRID=4326;POINT(-84.158004 34.196323)', 'https://picsum.photos/seed/streetlight-119/640/360', 'closed', '687 Birch St', '2025-11-30T11:12:22.853Z'::timestamptz)
  RETURNING id INTO v_report_id;
  INSERT INTO public.classifications
    (report_id, category, severity, is_emergency, confidence, model_version)
  VALUES
    (v_report_id, 'streetlight', 3, false, 0.90, 'synthetic-seed-v1');

  RAISE NOTICE 'Seeded 120 synthetic reports for city %', v_city_id;
END $$;

-- ---------------------------------------------------------------------------
-- Undo (only removes synthetic-seed rows; uncomment to reset before re-running):
--
-- DELETE FROM public.reports r
--  USING public.classifications c
--  WHERE c.report_id = r.id
--    AND c.model_version = 'synthetic-seed-v1';
-- ---------------------------------------------------------------------------
