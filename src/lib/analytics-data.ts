import { CATEGORY_META } from "@/lib/dashboard-data";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { DAY_MS } from "@/lib/utils/time-constants";

const logger = createLogger("analytics-data");

/* ------------------------------------------------------------------
   Analytics types
   ------------------------------------------------------------------ */

export interface AnalyticsKpis {
  resolution_rate_pct: number;
  resolution_rate_delta_pct: number;
  mttr_hours: number;
  mttr_delta_pct: number;
  sla_compliance_pct: number;
  sla_target_pct: number;
  active_backlog: number;
  backlog_delta_pct: number;
}

export interface TrendPoint {
  date: string; // ISO date (day)
  created: number;
  closed: number;
}

export interface ResolutionBucket {
  label: string; // e.g. "0-24h"
  hours_max: number;
  count: number;
}

export interface StatusFunnelStep {
  status: ReportStatus;
  label: string;
  count: number;
}

export interface SeveritySlice {
  severity: 1 | 2 | 3 | 4 | 5;
  count: number;
}

export interface HeatCell {
  day: number; // 0=Sun..6=Sat
  hour: number; // 0..23
  count: number;
}

export interface NeighborhoodVolume {
  name: string;
  count: number;
  open: number;
}

export interface CategoryResolution {
  category: ReportCategory;
  label: string;
  color: string;
  avg_hours: number;
  target_hours: number;
  count: number;
}

export interface ReporterVelocity {
  unique_reporters: number;
  reports_per_reporter: number;
  spark: number[]; // last 14 days
}

/* ------------------------------------------------------------------
   Deterministic mock generators
   ------------------------------------------------------------------ */

const seed = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Hardcoded demo KPIs — returned when the live aggregate errors or finds no
// reports, so analytics never renders an empty dashboard.
const KPI_FALLBACK: AnalyticsKpis = {
  resolution_rate_pct: 76.5,
  resolution_rate_delta_pct: 4.2,
  mttr_hours: 64,
  mttr_delta_pct: -8.1, // negative = faster (good)
  sla_compliance_pct: 88.4,
  sla_target_pct: 90,
  active_backlog: 43,
  backlog_delta_pct: 12.5,
};

// Live-mode fallback: honest zeros instead of demo literals, so an empty
// city renders an empty (not fabricated) analytics dashboard.
const KPI_EMPTY: AnalyticsKpis = {
  resolution_rate_pct: 0,
  resolution_rate_delta_pct: 0,
  mttr_hours: 0,
  mttr_delta_pct: 0,
  sla_compliance_pct: 0,
  sla_target_pct: 90,
  active_backlog: 0,
  backlog_delta_pct: 0,
};

const kpiFallback = () => (DEMO_MODE ? KPI_FALLBACK : KPI_EMPTY);

export async function fetchAnalyticsKpis(
  cityId: string,
): Promise<AnalyticsKpis> {
  if (!cityId) return kpiFallback();
  try {
    const { createServerClient } = await import("@/lib/db/client");
    const db = createServerClient();

    // Count-only queries (head: true → exact count, no row data). Fetching every
    // row and counting in JS silently undercounts once a city passes the
    // PostgREST max-rows cap (~1000), so resolution rate + backlog would drift
    // wrong with zero error signal. Counts are never truncated.
    //
    // Exclude rejected + merged: rejected reports aren't real issues, and merged
    // ones are duplicates folded into a primary (migrations 011/012). Counting
    // either would dilute the resolution-rate denominator.
    const base = () =>
      db
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("city_id", cityId)
        .not("status", "in", "(rejected,merged)");

    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
    const twoWeeksAgo = new Date(now - 14 * DAY_MS).toISOString();

    const [totalR, closedR, backlogR, twTotalR, twClosedR, pwTotalR, pwClosedR] =
      await Promise.all([
        base(),
        base().eq("status", "closed"),
        base().in("status", ["open", "dispatched", "in_progress"]),
        base().gt("created_at", weekAgo),
        base().eq("status", "closed").gt("created_at", weekAgo),
        base().gt("created_at", twoWeeksAgo).lte("created_at", weekAgo),
        base()
          .eq("status", "closed")
          .gt("created_at", twoWeeksAgo)
          .lte("created_at", weekAgo),
      ]);

    const total = totalR.count ?? 0;
    if (totalR.error || total === 0) {
      logger.warn("Falling back to KPI literals (query error or empty result)");
      return kpiFallback();
    }

    const closed = closedR.count ?? 0;
    const backlog = backlogR.count ?? 0;
    const twTotal = twTotalR.count ?? 0;
    const twClosed = twClosedR.count ?? 0;
    const pwTotal = pwTotalR.count ?? 0;
    const pwClosed = pwClosedR.count ?? 0;

    const rate = (closedN: number, totalN: number) =>
      totalN === 0 ? 0 : (closedN / totalN) * 100;
    const pctChange = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
      resolution_rate_pct: round1(rate(closed, total)),
      resolution_rate_delta_pct: round1(
        pctChange(rate(twClosed, twTotal), rate(pwClosed, pwTotal)),
      ),
      // MTTR + SLA need work-order completion timestamps that the synthetic DB
      // rows don't carry; keep the demo literals for those two signals (zeros
      // in live mode so real deployments never show fabricated numbers).
      mttr_hours: kpiFallback().mttr_hours,
      mttr_delta_pct: kpiFallback().mttr_delta_pct,
      sla_compliance_pct: kpiFallback().sla_compliance_pct,
      sla_target_pct: kpiFallback().sla_target_pct,
      active_backlog: backlog,
      backlog_delta_pct: round1(pctChange(twTotal, pwTotal)),
    };
  } catch (err) {
    logger.warn("Falling back to KPI literals (exception)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return kpiFallback();
  }
}

export async function fetchReportsTrend(
  cityId: string,
  days = 14,
  now = Date.now(),
): Promise<TrendPoint[]> {
  void cityId;
  return Array.from({ length: days }, (_, i) => {
    const idx = days - 1 - i;
    const date = new Date(now - idx * 86_400_000);
    // Live mode: keep the date axis but flatline at zero (charts stay mounted).
    if (!DEMO_MODE) {
      return { date: date.toISOString().slice(0, 10), created: 0, closed: 0 };
    }
    const base = 8 + Math.round(seed(idx, 7) * 10);
    const created = base + (idx % 4 === 0 ? 4 : 0);
    const closed = Math.max(1, Math.round(base * 0.78 + seed(idx, 13) * 4 - 2));
    return {
      date: date.toISOString().slice(0, 10),
      created,
      closed,
    };
  });
}

export async function fetchResolutionDistribution(
  cityId: string,
): Promise<ResolutionBucket[]> {
  void cityId;
  if (!DEMO_MODE) {
    return [
      { label: "<24h", hours_max: 24, count: 0 },
      { label: "1-3d", hours_max: 72, count: 0 },
      { label: "3-7d", hours_max: 168, count: 0 },
      { label: "1-2w", hours_max: 336, count: 0 },
      { label: ">2w", hours_max: 9999, count: 0 },
    ];
  }
  return [
    { label: "<24h", hours_max: 24, count: 62 },
    { label: "1-3d", hours_max: 72, count: 71 },
    { label: "3-7d", hours_max: 168, count: 38 },
    { label: "1-2w", hours_max: 336, count: 14 },
    { label: ">2w", hours_max: 9999, count: 4 },
  ];
}

export async function fetchStatusFunnel(
  cityId: string,
): Promise<StatusFunnelStep[]> {
  void cityId;
  const demo = DEMO_MODE;
  return [
    { status: "open", label: "Open", count: demo ? 43 : 0 },
    { status: "dispatched", label: "Dispatched", count: demo ? 31 : 0 },
    { status: "in_progress", label: "In progress", count: demo ? 22 : 0 },
    { status: "closed", label: "Resolved", count: demo ? 189 : 0 },
  ];
}

export async function fetchSeverityDistribution(
  cityId: string,
): Promise<SeveritySlice[]> {
  void cityId;
  if (!DEMO_MODE) {
    return ([1, 2, 3, 4, 5] as const).map((severity) => ({
      severity,
      count: 0,
    }));
  }
  return [
    { severity: 1, count: 58 },
    { severity: 2, count: 71 },
    { severity: 3, count: 64 },
    { severity: 4, count: 38 },
    { severity: 5, count: 16 },
  ];
}

export async function fetchHourlyHeatmap(cityId: string): Promise<HeatCell[]> {
  void cityId;
  const cells: HeatCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      // Higher during commute (7-9, 16-19) and on weekdays
      const commute = (h >= 7 && h <= 9) || (h >= 16 && h <= 19) ? 1.6 : 1;
      const weekday = d >= 1 && d <= 5 ? 1.25 : 0.6;
      const noise = 0.5 + seed(d * 24 + h, 23);
      const v = DEMO_MODE ? Math.round(commute * weekday * noise * 4) : 0;
      cells.push({ day: d, hour: h, count: v });
    }
  }
  return cells;
}

export async function fetchTopNeighborhoods(
  cityId: string,
): Promise<NeighborhoodVolume[]> {
  void cityId;
  if (!DEMO_MODE) return [];
  return [
    { name: "Downtown", count: 64, open: 12 },
    { name: "Vickery Village", count: 47, open: 9 },
    { name: "Sawnee Mountain", count: 38, open: 7 },
    { name: "Lake Lanier S.", count: 31, open: 5 },
    { name: "Bethelview", count: 24, open: 4 },
    { name: "Castleberry", count: 19, open: 3 },
  ];
}

export async function fetchCategoryResolution(
  cityId: string,
): Promise<CategoryResolution[]> {
  void cityId;
  if (!DEMO_MODE) return [];
  const rows: Array<{
    category: ReportCategory;
    avg_hours: number;
    target_hours: number;
    count: number;
  }> = [
    { category: "pothole", avg_hours: 58, target_hours: 72, count: 68 },
    { category: "streetlight", avg_hours: 96, target_hours: 120, count: 41 },
    { category: "water_leak", avg_hours: 14, target_hours: 24, count: 29 },
    {
      category: "sidewalk_damage",
      avg_hours: 184,
      target_hours: 168,
      count: 24,
    },
    { category: "downed_sign", avg_hours: 28, target_hours: 48, count: 22 },
    { category: "graffiti", avg_hours: 122, target_hours: 96, count: 18 },
    { category: "tree_down", avg_hours: 18, target_hours: 24, count: 14 },
    { category: "drainage", avg_hours: 76, target_hours: 96, count: 12 },
  ];
  return rows.map((r) => ({
    ...r,
    label: CATEGORY_META[r.category].label,
    color: CATEGORY_META[r.category].color,
  }));
}

export async function fetchReporterVelocity(
  cityId: string,
): Promise<ReporterVelocity> {
  void cityId;
  if (!DEMO_MODE) {
    return {
      unique_reporters: 0,
      reports_per_reporter: 0,
      spark: Array.from({ length: 14 }, () => 0),
    };
  }
  const spark = Array.from({ length: 14 }, (_, i) =>
    Math.round(6 + seed(i, 91) * 10),
  );
  return {
    unique_reporters: 134,
    reports_per_reporter: 1.84,
    spark,
  };
}
