-- =============================================================================
-- Civic — July calendar backfill (Cumming, GA)
--
-- Problem this fixes: the staff calendar (/city/cumming/calendar) plots
-- work_orders, not reports. The 120 rows in synthetic_reports.sql insert only
-- reports + classifications — NO work_orders — so they never reach the
-- calendar. Only the 5 base-seed reports create work orders (4 non-closed),
-- which is exactly the "4 in July" you saw.
--
-- What it does: takes a deterministic slice of the synthetic corpus and, for
-- each report, (a) re-dates created_at into a Jun–Aug 2026 window centered on
-- July, (b) forces an ALIVE status (the calendar hides closed/merged/rejected),
-- and (c) upserts a work_order carrying team_key (drives the chip color),
-- crew_type + assigned_crew_id (drives the Crew-type / Crew filters), a spread
-- dispatched_at, and completed_at on ~1/3 (renders struck-through).
--
-- Why re-date created_at too, not just dispatched_at: lib/db/calendar.ts
-- pre-filters the DB query on created_at with only a 60-day lookback, then
-- buckets on (dispatched_at ?? created_at) client-side. A Feb-created row
-- dispatched in July falls outside that 60-day window and gets dropped. So the
-- report's created_at must live in the visible window for the row to survive.
--
-- Prerequisites:
--   * base seed (city + users + 5 reports)   -> supabase/seed/index.ts
--   * synthetic corpus (120 reports)         -> supabase/seed/synthetic_reports.sql
--   * crews (optional, for crew assignment)  -> node supabase/seed/demo-crews.mjs
--     Without crews, chips still get their division COLOR; assigned_crew_id
--     stays NULL and the Crew filter is simply empty.
--
-- Idempotent: selects by stable report id (not the mutated created_at) and
-- upserts on work_orders.report_id (UNIQUE), so re-running converges to the
-- same result. Paste into the Supabase SQL editor and Run.
-- =============================================================================

DO $$
DECLARE
  v_city      uuid;
  rec         RECORD;
  i           int := 0;
  v_day       date;
  v_ts        timestamptz;
  v_team      text;
  v_ctype     text;
  v_crew      uuid;
  v_dept      work_order_department;
  v_status    report_status;
  v_completed boolean;
  v_ncrews    int;
BEGIN
  SELECT id INTO v_city FROM public.cities WHERE slug = 'cumming';
  IF v_city IS NULL THEN
    RAISE EXCEPTION 'City "cumming" not found — run the base seed first.';
  END IF;

  -- Ordered by id (a value we never mutate) so the selected slice and the
  -- per-row dates stay identical across re-runs. LIMIT controls density —
  -- 72 of 120 leaves the rest as older closed/rejected history for the grid.
  FOR rec IN
    SELECT rep.id AS rid, cl.category AS cat, cl.severity AS sev
      FROM public.reports rep
      JOIN public.classifications cl ON cl.report_id = rep.id
     WHERE rep.city_id = v_city
       AND cl.model_version = 'synthetic-seed-v1'
     ORDER BY rep.id
     LIMIT 72
  LOOP
    i := i + 1;

    -- Date window: ~2/3 into July, flanked by June + August so prev/next
    -- month navigation isn't empty. Keyed on i (stable) for reproducibility.
    v_day := CASE (i % 6)
      WHEN 0 THEN DATE '2026-06-08' + ((i * 13) % 21)   -- Jun 8..28
      WHEN 3 THEN DATE '2026-08-02' + ((i * 11) % 18)   -- Aug 2..19
      ELSE        DATE '2026-07-01' + ((i * 7)  % 31)   -- Jul 1..31
    END;
    v_ts := (v_day::timestamp + make_interval(hours => 8 + (i % 9)))::timestamptz;

    -- ~40% completed. Modulus 5 is coprime to the %6 month split above, so
    -- completed rows scatter across ALL months instead of aliasing onto one
    -- (i%3 aliased with i%6 → June/Aug all-completed, July none).
    v_completed := (i % 5 = 0 OR i % 5 = 2);

    -- category -> team_key  (verbatim from migration 026_team_routing / teams.ts)
    v_team := CASE rec.cat
      WHEN 'pothole'         THEN 'streets_roads'
      WHEN 'sidewalk_damage' THEN 'sidewalks_ada'
      WHEN 'drainage'        THEN 'stormwater'
      WHEN 'water_leak'      THEN 'water_utilities'
      WHEN 'streetlight'     THEN 'street_lighting'
      WHEN 'downed_sign'     THEN 'traffic_engineering'
      WHEN 'faded_signage'   THEN 'traffic_engineering'
      WHEN 'tree_down'       THEN 'parks_forestry'
      WHEN 'graffiti'        THEN 'graffiti_abatement'
      WHEN 'illegal_dump'    THEN 'code_enforcement'
      WHEN 'debris'          THEN 'environmental_services'
      ELSE 'general_admin'
    END;

    -- category -> department enum (NOT NULL; calendar ignores it, keep plausible)
    v_dept := (CASE rec.cat
      WHEN 'pothole'         THEN 'public_works'
      WHEN 'sidewalk_damage' THEN 'public_works'
      WHEN 'drainage'        THEN 'public_works'
      WHEN 'downed_sign'     THEN 'public_works'
      WHEN 'faded_signage'   THEN 'public_works'
      WHEN 'water_leak'      THEN 'utilities'
      WHEN 'streetlight'     THEN 'utilities'
      WHEN 'tree_down'       THEN 'parks'
      WHEN 'graffiti'        THEN 'code_enforcement'
      WHEN 'illegal_dump'    THEN 'code_enforcement'
      WHEN 'debris'          THEN 'sanitation'
      ELSE 'other'
    END)::work_order_department;

    -- team_key -> crew_type of the roster crew that serves it (NULL = no crew)
    v_ctype := CASE v_team
      WHEN 'streets_roads'       THEN 'paving'
      WHEN 'sidewalks_ada'       THEN 'concrete'
      WHEN 'stormwater'          THEN 'drain_crew'
      WHEN 'street_lighting'     THEN 'line_crew'
      WHEN 'traffic_engineering' THEN 'sign_crew'
      WHEN 'parks_forestry'      THEN 'arborist'
      WHEN 'graffiti_abatement'  THEN 'cleanup'
      ELSE NULL
    END;

    -- Resolve a real crew for (team_key, crew_type); round-robin across
    -- duplicates like the two paving crews. Stays NULL if crews aren't seeded.
    v_crew := NULL;
    IF v_ctype IS NOT NULL THEN
      SELECT count(*) INTO v_ncrews
        FROM public.crews
       WHERE city_id = v_city AND team_key = v_team
         AND crew_type = v_ctype AND active;
      IF v_ncrews > 0 THEN
        SELECT id INTO v_crew
          FROM public.crews
         WHERE city_id = v_city AND team_key = v_team
           AND crew_type = v_ctype AND active
         ORDER BY name
         OFFSET (i % v_ncrews) LIMIT 1;
      END IF;
    END IF;

    -- Force an alive status. Completed WOs keep an alive report status because
    -- the calendar's "completed" look is driven by work_orders.completed_at,
    -- while a dead report status would hide the chip entirely.
    v_status := (CASE
      WHEN v_completed THEN 'in_progress'
      WHEN (i % 3) = 1 THEN 'dispatched'
      ELSE 'open'
    END)::report_status;

    UPDATE public.reports
       SET created_at = v_ts,
           updated_at = v_ts,
           status     = v_status
     WHERE id = rec.rid;

    -- One work order per report (report_id UNIQUE). Insert-or-update so the
    -- calendar-relevant fields converge on re-run.
    INSERT INTO public.work_orders
      (report_id, department, team_key, crew_type, assigned_crew_id,
       priority_score, est_minutes, dispatched_at, completed_at)
    VALUES
      (rec.rid, v_dept, v_team, v_ctype, v_crew,
       rec.sev * 3.0 + (i % 3), 30 + rec.sev * 20, v_ts,
       CASE WHEN v_completed
            THEN v_ts + make_interval(days => 1 + (i % 4))
            ELSE NULL END)
    ON CONFLICT (report_id) DO UPDATE
      SET department       = EXCLUDED.department,
          team_key         = EXCLUDED.team_key,
          crew_type        = EXCLUDED.crew_type,
          assigned_crew_id = EXCLUDED.assigned_crew_id,
          priority_score   = EXCLUDED.priority_score,
          est_minutes      = EXCLUDED.est_minutes,
          dispatched_at    = EXCLUDED.dispatched_at,
          completed_at     = EXCLUDED.completed_at;
  END LOOP;

  RAISE NOTICE 'July calendar backfill: processed % Cumming reports.', i;
END $$;

-- Verify — work orders now landing per month for Cumming, using the same
-- alive-status + (dispatched_at ?? created_at) logic as the calendar.
SELECT to_char(
         date_trunc('month', COALESCE(w.dispatched_at, w.created_at)),
         'YYYY-MM'
       )                              AS month,
       count(*)                       AS work_orders,
       count(*) FILTER (WHERE w.completed_at IS NOT NULL) AS completed
  FROM public.work_orders w
  JOIN public.reports r ON r.id = w.report_id
  JOIN public.cities  c ON c.id = r.city_id
 WHERE c.slug = 'cumming'
   AND r.status NOT IN ('closed', 'merged', 'rejected')
 GROUP BY 1
 ORDER BY 1;
