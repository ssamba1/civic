-- 017_baselines_and_metrics
--
-- city_baselines: admin-entered pre-Civic values for before/after comparison.
--   Populate via the Supabase dashboard or a SQL INSERT after deploying.
--   Key metric names to enter (for the CSV to show before/after columns):
--     avg_resolution_days_before, average days to close a report before Civic
--     avg_response_days_before, average days before anyone responded
--     monthly_report_volume_before, avg monthly 311/email/phone reports received
--     monthly_duplicate_rate_pct_before, % that were dupes of an existing issue
--     manual_triage_min_per_report_before, staff minutes spent triaging one report
--
-- get_impact_metrics(): single RPC returning ALL impact stats as JSONB.
--   Called once by /api/admin/impact-export. Runs SECURITY DEFINER so it
--   can read every table regardless of caller RLS context.

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: city_baselines
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS city_baselines (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id            uuid        NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  metric_name        text        NOT NULL,
  metric_value       numeric,
  metric_text        text,
  measurement_period text,
  source             text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, metric_name)
);

ALTER TABLE city_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select" ON city_baselines
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('staff_dispatcher', 'staff_supervisor', 'admin'))
  );

CREATE POLICY "admin_all" ON city_baselines
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_impact_metrics()
-- Returns a single JSONB object with every impact stat.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_impact_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(

    -- ── REACH ────────────────────────────────────────────────────────────────
    'total_reports', (
      SELECT COUNT(*) FROM reports WHERE status NOT IN ('rejected')
    ),
    'total_merged_as_duplicates', (
      SELECT COUNT(*) FROM reports WHERE status = 'merged'
    ),
    'total_rejected', (
      SELECT COUNT(*) FROM reports WHERE status = 'rejected'
    ),
    'unique_residents', (
      SELECT COUNT(DISTINCT reporter_id) FROM reports WHERE status NOT IN ('rejected')
    ),
    'departments_active', (
      SELECT COUNT(DISTINCT department) FROM work_orders
    ),
    'first_time_submitter_pct', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE cnt = 1) * 100.0 / NULLIF(COUNT(*), 0), 1
      )
      FROM (
        SELECT reporter_id, COUNT(*) AS cnt
        FROM reports WHERE status NOT IN ('rejected')
        GROUP BY reporter_id
      ) AS sub
    ),
    'repeat_submitter_pct', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE cnt > 1) * 100.0 / NULLIF(COUNT(*), 0), 1
      )
      FROM (
        SELECT reporter_id, COUNT(*) AS cnt
        FROM reports WHERE status NOT IN ('rejected')
        GROUP BY reporter_id
      ) AS sub
    ),

    -- ── TIMING ───────────────────────────────────────────────────────────────
    'median_upload_to_classify_min', (
      SELECT ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (c.created_at - r.created_at)) / 60.0
        )::numeric, 1
      )
      FROM reports r
      JOIN classifications c ON c.report_id = r.id
      WHERE c.confidence > 0
    ),
    'p90_upload_to_classify_min', (
      SELECT ROUND(
        PERCENTILE_CONT(0.9) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (c.created_at - r.created_at)) / 60.0
        )::numeric, 1
      )
      FROM reports r
      JOIN classifications c ON c.report_id = r.id
      WHERE c.confidence > 0
    ),
    'median_report_to_triage_min', (
      SELECT ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (wo.created_at - r.created_at)) / 60.0
        )::numeric, 1
      )
      FROM reports r
      JOIN work_orders wo ON wo.report_id = r.id
    ),
    'median_report_to_dispatch_hrs', (
      SELECT ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (wo.dispatched_at - r.created_at)) / 3600.0
        )::numeric, 1
      )
      FROM reports r
      JOIN work_orders wo ON wo.report_id = r.id
      WHERE wo.dispatched_at IS NOT NULL
    ),
    'median_report_to_resolution_hrs', (
      SELECT ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
        )::numeric, 1
      )
      FROM reports r
      JOIN work_orders wo ON wo.report_id = r.id
      WHERE wo.completed_at IS NOT NULL
    ),
    'p90_report_to_resolution_hrs', (
      SELECT ROUND(
        PERCENTILE_CONT(0.9) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
        )::numeric, 1
      )
      FROM reports r
      JOIN work_orders wo ON wo.report_id = r.id
      WHERE wo.completed_at IS NOT NULL
    ),

    -- ── AI CLASSIFICATION ─────────────────────────────────────────────────────
    'pct_classified_automatically', (
      SELECT ROUND(
        COUNT(c.id) FILTER (WHERE c.confidence > 0) * 100.0 /
        NULLIF(COUNT(r.id), 0), 1
      )
      FROM reports r
      LEFT JOIN classifications c ON c.report_id = r.id
      WHERE r.status NOT IN ('rejected')
    ),
    'pct_classification_failed', (
      SELECT ROUND(
        (COUNT(r.id) - COUNT(c.id) FILTER (WHERE COALESCE(c.confidence, 0) > 0)) * 100.0 /
        NULLIF(COUNT(r.id), 0), 1
      )
      FROM reports r
      LEFT JOIN classifications c ON c.report_id = r.id
      WHERE r.status NOT IN ('rejected')
    ),
    'pct_correct_first_pass_routing', (
      -- Reports with a classification that staff never overrode = correctly routed
      SELECT ROUND(
        (COUNT(c.id) - COUNT(cf.id)) * 100.0 / NULLIF(COUNT(c.id), 0), 1
      )
      FROM reports r
      JOIN classifications c ON c.report_id = r.id
      LEFT JOIN classification_feedback cf ON cf.report_id = r.id
    ),
    'total_classification_overrides', (
      SELECT COUNT(*) FROM classification_feedback
    ),
    'avg_ai_confidence', (
      SELECT ROUND(AVG(confidence)::numeric, 3) FROM classifications WHERE confidence > 0
    ),
    'total_emergency_reports', (
      SELECT COUNT(*) FROM classifications WHERE is_emergency = true
    ),
    'pct_ai_generated_work_orders', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE wo_source = 'ai') * 100.0 / NULLIF(COUNT(*), 0), 1
      )
      FROM work_orders
    ),

    -- ── DUPLICATES ────────────────────────────────────────────────────────────
    'total_duplicates_merged', (
      SELECT COUNT(*) FROM merges
    ),
    'duplicate_merge_rate_pct', (
      SELECT ROUND(
        COUNT(m.id) * 100.0 / NULLIF(COUNT(r.id), 0), 1
      )
      FROM reports r
      LEFT JOIN merges m ON m.duplicate_report_id = r.id
    ),

    -- ── RESOLUTION STATUS ─────────────────────────────────────────────────────
    'total_resolved', (
      SELECT COUNT(*) FROM reports WHERE status = 'closed'
    ),
    'total_open', (
      SELECT COUNT(*) FROM reports WHERE status = 'open'
    ),
    'total_dispatched', (
      SELECT COUNT(*) FROM reports WHERE status = 'dispatched'
    ),
    'total_in_progress', (
      SELECT COUNT(*) FROM reports WHERE status = 'in_progress'
    ),
    'overall_resolution_rate_pct', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE status = 'closed') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('rejected', 'merged')), 0), 1
      )
      FROM reports
    ),

    -- ── SLA COMPLIANCE ────────────────────────────────────────────────────────
    'pct_resolved_within_24h', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE wo.completed_at - r.created_at < INTERVAL '24 hours') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE wo.completed_at IS NOT NULL), 0), 1
      )
      FROM reports r JOIN work_orders wo ON wo.report_id = r.id
    ),
    'pct_resolved_within_48h', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE wo.completed_at - r.created_at < INTERVAL '48 hours') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE wo.completed_at IS NOT NULL), 0), 1
      )
      FROM reports r JOIN work_orders wo ON wo.report_id = r.id
    ),
    'pct_resolved_within_7d', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE wo.completed_at - r.created_at < INTERVAL '7 days') * 100.0 /
        NULLIF(COUNT(*) FILTER (WHERE wo.completed_at IS NOT NULL), 0), 1
      )
      FROM reports r JOIN work_orders wo ON wo.report_id = r.id
    ),
    'avg_days_to_close', (
      SELECT ROUND(
        AVG(EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 86400.0)::numeric, 1
      )
      FROM reports r JOIN work_orders wo ON wo.report_id = r.id
      WHERE wo.completed_at IS NOT NULL
    ),

    -- ── ENGAGEMENT ────────────────────────────────────────────────────────────
    'total_upvotes', (
      SELECT COUNT(*) FROM verifications WHERE vote = 'confirmed'
    ),
    'reports_with_descriptions_pct', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE description IS NOT NULL AND description <> '') * 100.0 /
        NULLIF(COUNT(*), 0), 1
      )
      FROM reports WHERE status NOT IN ('rejected')
    ),

    -- ── COST ─────────────────────────────────────────────────────────────────
    'total_estimated_repair_cost', (
      SELECT ROUND(COALESCE(SUM(est_cost), 0)::numeric, 2)
      FROM work_orders WHERE est_cost IS NOT NULL
    ),
    'avg_estimated_cost_per_report', (
      SELECT ROUND(COALESCE(AVG(est_cost), 0)::numeric, 2)
      FROM work_orders WHERE est_cost > 0
    ),
    'cost_accuracy_pct', (
      -- Only computable once staff close reports with actual cost (fix_cost_estimate)
      SELECT ROUND(
        100.0 - AVG(
          ABS(est_cost - fix_cost_estimate) / NULLIF(fix_cost_estimate, 0)
        ) * 100.0, 1
      )
      FROM work_orders
      WHERE est_cost IS NOT NULL AND fix_cost_estimate IS NOT NULL AND fix_cost_estimate > 0
    ),

    -- ── CATEGORY BREAKDOWN ────────────────────────────────────────────────────
    'reports_by_category', (
      SELECT COALESCE(jsonb_object_agg(cat, cnt), '{}'::jsonb)
      FROM (
        SELECT c.category::text AS cat, COUNT(*) AS cnt
        FROM classifications c
        JOIN reports r ON r.id = c.report_id
        WHERE r.status NOT IN ('rejected', 'merged')
        GROUP BY c.category
        ORDER BY cnt DESC
      ) AS sub
    ),
    'resolution_rate_by_category', (
      SELECT COALESCE(jsonb_object_agg(cat, rate), '{}'::jsonb)
      FROM (
        SELECT c.category::text AS cat,
               ROUND(
                 COUNT(*) FILTER (WHERE r.status = 'closed') * 100.0 /
                 NULLIF(COUNT(*), 0), 1
               ) AS rate
        FROM classifications c
        JOIN reports r ON r.id = c.report_id
        WHERE r.status NOT IN ('rejected', 'merged')
        GROUP BY c.category
      ) AS sub
    ),
    'median_resolution_hrs_by_category', (
      SELECT COALESCE(jsonb_object_agg(cat, med_hrs), '{}'::jsonb)
      FROM (
        SELECT c.category::text AS cat,
               ROUND(
                 PERCENTILE_CONT(0.5) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
                 )::numeric, 1
               ) AS med_hrs
        FROM reports r
        JOIN classifications c ON c.report_id = r.id
        JOIN work_orders wo ON wo.report_id = r.id
        WHERE wo.completed_at IS NOT NULL
        GROUP BY c.category
      ) AS sub
    ),

    -- ── DEPARTMENT BREAKDOWN ──────────────────────────────────────────────────
    'reports_by_department', (
      SELECT COALESCE(jsonb_object_agg(dept, cnt), '{}'::jsonb)
      FROM (
        SELECT wo.department::text AS dept, COUNT(*) AS cnt
        FROM work_orders wo
        GROUP BY wo.department
        ORDER BY cnt DESC
      ) AS sub
    ),

    -- ── TIME RANGE ────────────────────────────────────────────────────────────
    'earliest_report_date', (
      SELECT to_char(MIN(created_at), 'YYYY-MM-DD') FROM reports
    ),
    'latest_report_date', (
      SELECT to_char(MAX(created_at), 'YYYY-MM-DD') FROM reports
    ),
    'data_generated_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')

  ) INTO result;

  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_baselines(_city_id uuid)
-- Returns all pre-Civic baseline values for a given city as JSONB.
-- Used by the CSV export to populate the "Pre-Civic Baseline" column.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_baselines(_city_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      metric_name,
      jsonb_build_object(
        'value',  metric_value,
        'text',   metric_text,
        'period', measurement_period,
        'source', source,
        'notes',  notes
      )
    ),
    '{}'::jsonb
  )
  FROM city_baselines
  WHERE city_id = _city_id;
$$;
