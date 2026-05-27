-- =============================================================================
-- Civic – Metrics Views
-- Migration: 20260527_002_metrics_views.sql
-- North-star metrics from design doc §6
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. time_to_submit (P50) — client-reported submit_duration_ms on reports
-- ---------------------------------------------------------------------------
CREATE VIEW metric_time_to_submit AS
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY r.submit_duration_ms) AS p50_ms
FROM reports r
WHERE r.submit_duration_ms IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. time_to_triage (P50) — time from report creation to work order creation
--    (triage = AI classification + work order generation)
-- ---------------------------------------------------------------------------
CREATE VIEW metric_time_to_triage AS
SELECT
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (wo.created_at - r.created_at))
  ) AS p50_seconds
FROM reports r
JOIN work_orders wo ON wo.report_id = r.id;

-- ---------------------------------------------------------------------------
-- 3. time_to_resolution (P50) — time from report creation to work order completion
-- ---------------------------------------------------------------------------
CREATE VIEW metric_time_to_resolution AS
SELECT
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (wo.completed_at - r.created_at)) / 3600.0
  ) AS p50_hours
FROM reports r
JOIN work_orders wo ON wo.report_id = r.id
WHERE wo.completed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. classification_accuracy — % of classifications NOT overridden by staff
--    A classification is "accurate" if the work order still matches the
--    original AI category (no staff reclassification). When staff override,
--    they update the classification row. We approximate accuracy by comparing
--    classification.created_at vs classification updated state.
--    For v1, we track via verifications: confirmed / total verified.
-- ---------------------------------------------------------------------------
CREATE VIEW metric_classification_accuracy AS
SELECT
  COUNT(*) FILTER (WHERE v.vote = 'confirmed') AS confirmed_count,
  COUNT(*) AS total_verified,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE v.vote = 'confirmed')::numeric / COUNT(*)::numeric,
      4
    )
    ELSE NULL
  END AS accuracy_rate
FROM verifications v
JOIN reports r ON r.id = v.report_id;

-- ---------------------------------------------------------------------------
-- 5. reports_by_category — count per classification category
-- ---------------------------------------------------------------------------
CREATE VIEW metric_reports_by_category AS
SELECT
  cl.category,
  COUNT(*) AS report_count
FROM classifications cl
GROUP BY cl.category
ORDER BY report_count DESC;

-- ---------------------------------------------------------------------------
-- 6. reports_by_status — count per report status
-- ---------------------------------------------------------------------------
CREATE VIEW metric_reports_by_status AS
SELECT
  r.status,
  COUNT(*) AS report_count
FROM reports r
GROUP BY r.status
ORDER BY report_count DESC;

-- ---------------------------------------------------------------------------
-- Grant read access on metric views to authenticated users
-- ---------------------------------------------------------------------------
GRANT SELECT ON metric_time_to_submit       TO authenticated;
GRANT SELECT ON metric_time_to_triage       TO authenticated;
GRANT SELECT ON metric_time_to_resolution   TO authenticated;
GRANT SELECT ON metric_classification_accuracy TO authenticated;
GRANT SELECT ON metric_reports_by_category  TO authenticated;
GRANT SELECT ON metric_reports_by_status    TO authenticated;
