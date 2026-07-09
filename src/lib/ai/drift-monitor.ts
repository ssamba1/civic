import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

/* ==================================================================
   Classification drift monitor (NEXT_100 #37).

   Staff corrections land in classification_feedback (original vs corrected
   category). The override rate is a proxy for model accuracy: rising overrides =
   the model drifting on this city's live distribution. This computes the recent
   vs prior override rate so an operator (or an alert) can catch degradation
   before it erodes trust. Pure read; no new schema.
   ================================================================== */

const logger = createLogger("[drift-monitor]");
const WINDOW_DAYS = 30;

export interface DriftMetric {
  recentOverrideRate: number | null; // 0..1 over the last WINDOW_DAYS
  priorOverrideRate: number | null; // 0..1 over the WINDOW_DAYS before that
  deltaPct: number | null; // recent - prior, in percentage points
  recentSample: number;
  priorSample: number;
  windowDays: number;
  alert: boolean; // true when drift is material on a meaningful sample
}

interface Row {
  original_category: string | null;
  corrected_category: string | null;
  created_at: string;
}

function rate(rows: Row[]): { rate: number | null; n: number } {
  if (rows.length === 0) return { rate: null, n: 0 };
  const overrides = rows.filter(
    (r) => r.original_category !== r.corrected_category,
  ).length;
  return { rate: overrides / rows.length, n: rows.length };
}

export async function computeDrift(): Promise<DriftMetric> {
  const db = createServerClient();
  const now = Date.now();
  const windowMs = WINDOW_DAYS * 86_400_000;
  const sinceRecent = new Date(now - windowMs).toISOString();
  const sincePrior = new Date(now - 2 * windowMs).toISOString();

  const empty: DriftMetric = {
    recentOverrideRate: null,
    priorOverrideRate: null,
    deltaPct: null,
    recentSample: 0,
    priorSample: 0,
    windowDays: WINDOW_DAYS,
    alert: false,
  };

  const { data, error } = await db
    .from("classification_feedback")
    .select("original_category, corrected_category, created_at")
    .gte("created_at", sincePrior)
    .limit(10_000);
  if (error) {
    logger.warn("drift_query_failed", { detail: error.message });
    return empty;
  }

  const rows = (data ?? []) as Row[];
  const recent = rate(rows.filter((r) => r.created_at >= sinceRecent));
  const prior = rate(rows.filter((r) => r.created_at < sinceRecent));

  const deltaPct =
    recent.rate != null && prior.rate != null
      ? Math.round((recent.rate - prior.rate) * 1000) / 10
      : null;

  // Alert on a >=10 pt rise with a non-trivial recent sample.
  const alert = deltaPct != null && deltaPct >= 10 && recent.n >= 20;

  return {
    recentOverrideRate: recent.rate,
    priorOverrideRate: prior.rate,
    deltaPct,
    recentSample: recent.n,
    priorSample: prior.n,
    windowDays: WINDOW_DAYS,
    alert,
  };
}
