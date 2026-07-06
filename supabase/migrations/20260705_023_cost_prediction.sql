-- =============================================================================
-- Migration 023 — Cost prediction: actual_cost capture + category_cost_stats RPC
--
-- Implements the design from docs/superpowers/specs/2026-07-01-cost-prediction-cold-start-design.md
-- Decisions: per-city training, numeric(12,2) whole-dollars, compute-live,
-- outlier rejection at capture (>5× running median → actual_cost_excluded=true).
--
-- NOT auto-applied. Run with: npm run db:migrate
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE for RPC.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns on work_orders
-- ---------------------------------------------------------------------------

-- Real spend entered by the worker at job close. Whole dollars, numeric(12,2)
-- pins the unit — no cents/dollars 100× ambiguity. NULL until reported.
-- This is the ONLY training signal for the cost predictor.
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS actual_cost numeric(12,2);

-- Set true when actual_cost > 5× the category's running median at capture time.
-- Excluded from training; supervisor can clear to re-admit.
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS actual_cost_excluded boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. category_cost_stats(_city_id) — per-city aggregate RPC
--
-- Returns one row per (city, category) from accepted actuals:
--   base         — mean actual_cost
--   avg_severity — mean classification severity
--   stddev       — population stddev of actual_cost
--   n            — count of accepted actuals
--   reliability  — sampleConf * dispersionConf in [0, 1)
--   tier         — 'low' | 'medium' | 'high'
--
-- Caller derives predicted cost for a specific report as:
--   mult      = clamp(report_severity / avg_severity, 0.6, 1.8)
--   predicted = max(round(base * mult), material_floor)
--
-- Returns only rows where n >= 1 (the unknown→known threshold check is done
-- by the caller: n < 5 → Unknown, n >= 5 → show prediction).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.category_cost_stats(_city_id uuid)
RETURNS TABLE (
  category        text,
  base            numeric,
  avg_severity    numeric,
  stddev          numeric,
  n               bigint,
  reliability     numeric,
  tier            text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH actuals AS (
    SELECT
      c.category::text                  AS category,
      wo.actual_cost,
      c.severity
    FROM work_orders   wo
    JOIN reports       r  ON r.id = wo.report_id
    JOIN classifications c ON c.report_id = r.id
    WHERE r.city_id               = _city_id
      AND wo.actual_cost          IS NOT NULL
      AND wo.actual_cost_excluded = false
  ),
  agg AS (
    SELECT
      category,
      AVG(actual_cost)::numeric(12,2)            AS base,
      AVG(severity)::numeric(5,2)                AS avg_severity,
      COALESCE(STDDEV_POP(actual_cost), 0)::numeric(12,2) AS stddev,
      COUNT(*)                                   AS n
    FROM actuals
    GROUP BY category
  ),
  scored AS (
    SELECT
      category,
      base,
      avg_severity,
      stddev,
      n,
      -- sampleConf = n / (n + 10); saturates toward 1
      (n::numeric / (n + 10))                   AS sample_conf,
      -- dispersionConf = clamp(1 - CV, 0, 1)
      GREATEST(0, LEAST(1,
        1 - COALESCE(stddev / NULLIF(base, 0), 0)
      ))                                         AS disp_conf
    FROM agg
  )
  SELECT
    category,
    base,
    avg_severity,
    stddev,
    n,
    ROUND((sample_conf * disp_conf)::numeric, 4) AS reliability,
    CASE
      WHEN (sample_conf * disp_conf) >= 0.66 THEN 'high'
      WHEN (sample_conf * disp_conf) >= 0.34 THEN 'medium'
      ELSE 'low'
    END                                          AS tier
  FROM scored
  ORDER BY category;
$$;

-- City-scoped: only reads _city_id rows. No cross-city enumeration.
GRANT EXECUTE ON FUNCTION public.category_cost_stats(uuid)
  TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- 3. get_impact_metrics(): re-created with the corrected cost_accuracy_pct
--
-- Migration 017 (already applied on live databases) computed cost accuracy
-- against fix_cost_estimate, which nothing populates. The metric must compare
-- est_cost with the worker-captured actual_cost added above, excluding rows
-- flagged as outliers. 017 itself stays immutable (applied history); the fix
-- ships here by re-creating the function. Verbatim copy of 017's function
-- with only the cost_accuracy_pct block changed. Grants/ACLs survive
-- CREATE OR REPLACE, so no re-grant is needed.
-- ============================================================================

BEGIN;

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
      -- Computable once workers close reports with actual_cost captured
      SELECT ROUND(
        100.0 - AVG(
          ABS(est_cost - actual_cost) / NULLIF(actual_cost, 0)
        ) * 100.0, 1
      )
      FROM work_orders
      WHERE est_cost IS NOT NULL AND actual_cost IS NOT NULL AND actual_cost > 0
        AND actual_cost_excluded = false
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

COMMIT;
