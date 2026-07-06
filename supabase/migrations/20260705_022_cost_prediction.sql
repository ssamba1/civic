-- =============================================================================
-- Migration 022 — Cost prediction: actual_cost capture + category_cost_stats RPC
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
