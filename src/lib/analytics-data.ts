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
  /**
   * True when these numbers are illustrative rather than measured — the demo
   * literals below, or the fallback taken when the live aggregate errors or the
   * city has no reports yet. The UI must label them: an unmarked 76.5% reads to
   * anyone looking at the dashboard as a real outcome.
   */
  synthetic: boolean;
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

export interface RecurringHotspot {
  category: ReportCategory;
  label: string;
  color: string;
  lng: number;
  lat: number;
  total: number;
  open_count: number;
  episodes: number; // distinct weeks the spot recurred
  first_seen: string; // ISO date
  last_seen: string; // ISO date
}

/* ------------------------------------------------------------------
   Live query helper
   ------------------------------------------------------------------ */

// Calls a per-city analytics RPC (migration 036) with the service-role client.
// Returns [] on any error so a live widget degrades to an empty (never
// fabricated) state instead of throwing. cityId is required for a real query.
async function rpcRows<T>(
  fn: string,
  cityId: string,
  extra: Record<string, unknown> = {},
): Promise<T[]> {
  if (!cityId) return [];
  try {
    const { createServerClient } = await import("@/lib/db/client");
    const db = createServerClient();
    const { data, error } = await db.rpc(fn, { _city_id: cityId, ...extra });
    if (error) {
      logger.warn(`analytics RPC ${fn} failed`, { error: error.message });
      return [];
    }
    return (data ?? []) as T[];
  } catch (err) {
    logger.warn(`analytics RPC ${fn} threw`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/* ------------------------------------------------------------------
   Deterministic mock generators (DEMO_MODE only)
   ------------------------------------------------------------------ */

const seed = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Hardcoded demo KPIs — returned in DEMO_MODE, or when the live aggregate
// errors / finds no reports, so demo analytics never renders empty.
const KPI_FALLBACK: AnalyticsKpis = {
  synthetic: true,
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
  // Honest zeros are measured, not invented — an empty city really has none.
  synthetic: false,
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

    const [
      totalR,
      closedR,
      backlogR,
      twTotalR,
      twClosedR,
      pwTotalR,
      pwClosedR,
    ] = await Promise.all([
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

    // Real MTTR + SLA from completed work orders (migration 036 RPC). In demo
    // mode keep the literals — the synthetic rows carry no completion timestamps
    // so a real query would flatline them to zero.
    let mttr_hours = kpiFallback().mttr_hours;
    let mttr_delta_pct = kpiFallback().mttr_delta_pct;
    let sla_compliance_pct = kpiFallback().sla_compliance_pct;
    if (!DEMO_MODE) {
      const [ms] = await rpcRows<{
        mttr_hours: number;
        mttr_prev_hours: number;
        sla_compliance_pct: number;
        sla_denominator: number;
      }>("analytics_mttr_sla", cityId);
      mttr_hours = ms ? Number(ms.mttr_hours) : 0;
      mttr_delta_pct = ms
        ? round1(pctChange(Number(ms.mttr_hours), Number(ms.mttr_prev_hours)))
        : 0;
      // Only report SLA compliance when at least one work order carries a due_at;
      // otherwise there is nothing to comply with — leave it at zero.
      sla_compliance_pct =
        ms && Number(ms.sla_denominator) > 0
          ? Number(ms.sla_compliance_pct)
          : 0;
    }

    return {
      // Demo mode keeps the MTTR/SLA literals above, so the row is only fully
      // measured outside it.
      synthetic: DEMO_MODE,
      resolution_rate_pct: round1(rate(closed, total)),
      resolution_rate_delta_pct: round1(
        pctChange(rate(twClosed, twTotal), rate(pwClosed, pwTotal)),
      ),
      mttr_hours,
      mttr_delta_pct,
      sla_compliance_pct,
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
  if (DEMO_MODE) {
    return Array.from({ length: days }, (_, i) => {
      const idx = days - 1 - i;
      const date = new Date(now - idx * 86_400_000);
      const base = 8 + Math.round(seed(idx, 7) * 10);
      const created = base + (idx % 4 === 0 ? 4 : 0);
      const closed = Math.max(
        1,
        Math.round(base * 0.78 + seed(idx, 13) * 4 - 2),
      );
      return { date: date.toISOString().slice(0, 10), created, closed };
    });
  }

  const rows = await rpcRows<{ day: string; created: number; closed: number }>(
    "analytics_trend",
    cityId,
    { _days: days },
  );
  if (rows.length > 0) {
    return rows.map((r) => ({
      date: r.day,
      created: Number(r.created),
      closed: Number(r.closed),
    }));
  }
  // Empty city / error: keep the date axis, flatline at zero (charts stay mounted).
  return Array.from({ length: days }, (_, i) => {
    const idx = days - 1 - i;
    const date = new Date(now - idx * 86_400_000);
    return { date: date.toISOString().slice(0, 10), created: 0, closed: 0 };
  });
}

export async function fetchResolutionDistribution(
  cityId: string,
): Promise<ResolutionBucket[]> {
  const EMPTY: ResolutionBucket[] = [
    { label: "<24h", hours_max: 24, count: 0 },
    { label: "1-3d", hours_max: 72, count: 0 },
    { label: "3-7d", hours_max: 168, count: 0 },
    { label: "1-2w", hours_max: 336, count: 0 },
    { label: ">2w", hours_max: 9999, count: 0 },
  ];
  if (DEMO_MODE) {
    return [
      { label: "<24h", hours_max: 24, count: 62 },
      { label: "1-3d", hours_max: 72, count: 71 },
      { label: "3-7d", hours_max: 168, count: 38 },
      { label: "1-2w", hours_max: 336, count: 14 },
      { label: ">2w", hours_max: 9999, count: 4 },
    ];
  }
  const rows = await rpcRows<{
    label: string;
    hours_max: number;
    count: number;
  }>("analytics_resolution_distribution", cityId);
  return rows.length > 0
    ? rows.map((r) => ({
        label: r.label,
        hours_max: Number(r.hours_max),
        count: Number(r.count),
      }))
    : EMPTY;
}

const FUNNEL_LABELS: Record<string, string> = {
  open: "Open",
  dispatched: "Dispatched",
  in_progress: "In progress",
  closed: "Resolved",
};
const FUNNEL_ORDER: ReportStatus[] = [
  "open",
  "dispatched",
  "in_progress",
  "closed",
];

export async function fetchStatusFunnel(
  cityId: string,
): Promise<StatusFunnelStep[]> {
  if (DEMO_MODE) {
    return [
      { status: "open", label: "Open", count: 43 },
      { status: "dispatched", label: "Dispatched", count: 31 },
      { status: "in_progress", label: "In progress", count: 22 },
      { status: "closed", label: "Resolved", count: 189 },
    ];
  }
  const rows = await rpcRows<{ status: string; count: number }>(
    "analytics_status_funnel",
    cityId,
  );
  const byStatus = new Map(rows.map((r) => [r.status, Number(r.count)]));
  return FUNNEL_ORDER.map((status) => ({
    status,
    label: FUNNEL_LABELS[status],
    count: byStatus.get(status) ?? 0,
  }));
}

export async function fetchSeverityDistribution(
  cityId: string,
): Promise<SeveritySlice[]> {
  if (DEMO_MODE) {
    return [
      { severity: 1, count: 58 },
      { severity: 2, count: 71 },
      { severity: 3, count: 64 },
      { severity: 4, count: 38 },
      { severity: 5, count: 16 },
    ];
  }
  const rows = await rpcRows<{ severity: number; count: number }>(
    "analytics_severity",
    cityId,
  );
  const bySev = new Map(rows.map((r) => [Number(r.severity), Number(r.count)]));
  return ([1, 2, 3, 4, 5] as const).map((severity) => ({
    severity,
    count: bySev.get(severity) ?? 0,
  }));
}

export async function fetchHourlyHeatmap(cityId: string): Promise<HeatCell[]> {
  if (DEMO_MODE) {
    const cells: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        // Higher during commute (7-9, 16-19) and on weekdays
        const commute = (h >= 7 && h <= 9) || (h >= 16 && h <= 19) ? 1.6 : 1;
        const weekday = d >= 1 && d <= 5 ? 1.25 : 0.6;
        const noise = 0.5 + seed(d * 24 + h, 23);
        cells.push({
          day: d,
          hour: h,
          count: Math.round(commute * weekday * noise * 4),
        });
      }
    }
    return cells;
  }

  const rows = await rpcRows<{ day: number; hour: number; count: number }>(
    "analytics_hourly_heatmap",
    cityId,
  );
  const byCell = new Map(
    rows.map((r) => [`${r.day}:${r.hour}`, Number(r.count)]),
  );
  const cells: HeatCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      cells.push({ day: d, hour: h, count: byCell.get(`${d}:${h}`) ?? 0 });
    }
  }
  return cells;
}

export async function fetchTopNeighborhoods(
  cityId: string,
): Promise<NeighborhoodVolume[]> {
  if (DEMO_MODE) {
    return [
      { name: "Downtown", count: 64, open: 12 },
      { name: "Vickery Village", count: 47, open: 9 },
      { name: "Sawnee Mountain", count: 38, open: 7 },
      { name: "Lake Lanier S.", count: 31, open: 5 },
      { name: "Bethelview", count: 24, open: 4 },
      { name: "Castleberry", count: 19, open: 3 },
    ];
  }
  const rows = await rpcRows<{ name: string; count: number; open: number }>(
    "analytics_top_neighborhoods",
    cityId,
    { _limit: 6 },
  );
  return rows.map((r) => ({
    name: r.name,
    count: Number(r.count),
    open: Number(r.open),
  }));
}

export async function fetchCategoryResolution(
  cityId: string,
): Promise<CategoryResolution[]> {
  const enrich = (r: {
    category: ReportCategory;
    avg_hours: number;
    target_hours: number;
    count: number;
  }): CategoryResolution => ({
    ...r,
    label: CATEGORY_META[r.category]?.label ?? r.category,
    color: CATEGORY_META[r.category]?.color ?? "#888",
  });

  if (DEMO_MODE) {
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
    return rows.map(enrich);
  }

  const rows = await rpcRows<{
    category: ReportCategory;
    avg_hours: number;
    target_hours: number;
    count: number;
  }>("analytics_category_resolution", cityId);
  return rows.map((r) =>
    enrich({
      category: r.category,
      avg_hours: Number(r.avg_hours),
      target_hours: Number(r.target_hours),
      count: Number(r.count),
    }),
  );
}

export async function fetchReporterVelocity(
  cityId: string,
): Promise<ReporterVelocity> {
  if (DEMO_MODE) {
    const spark = Array.from({ length: 14 }, (_, i) =>
      Math.round(6 + seed(i, 91) * 10),
    );
    return { unique_reporters: 134, reports_per_reporter: 1.84, spark };
  }

  const [row] = await rpcRows<{ unique_reporters: number; total: number }>(
    "analytics_reporter_velocity",
    cityId,
  );
  const unique = row ? Number(row.unique_reporters) : 0;
  const total = row ? Number(row.total) : 0;
  const trend = await fetchReportsTrend(cityId, 14);
  return {
    unique_reporters: unique,
    reports_per_reporter:
      unique === 0 ? 0 : Math.round((total / unique) * 100) / 100,
    spark: trend.map((p) => p.created),
  };
}

// OUTFLANK #41 — recurring-problem detection. Locations where the same category
// recurs across >= minEpisodes distinct weeks (migration 037). In demo mode
// returns a couple of illustrative spots so the widget is never empty on stage.
export async function fetchRecurringHotspots(
  cityId: string,
  minCount = 3,
  minEpisodes = 2,
): Promise<RecurringHotspot[]> {
  const enrich = (r: {
    category: ReportCategory;
    lng: number;
    lat: number;
    total: number;
    open_count: number;
    episodes: number;
    first_seen: string;
    last_seen: string;
  }): RecurringHotspot => ({
    ...r,
    label: CATEGORY_META[r.category]?.label ?? r.category,
    color: CATEGORY_META[r.category]?.color ?? "#888",
  });

  if (DEMO_MODE) {
    return [
      {
        category: "drainage" as ReportCategory,
        lng: -84.1402,
        lat: 34.2073,
        total: 9,
        open_count: 2,
        episodes: 4,
        first_seen: "2026-02-11",
        last_seen: "2026-07-02",
      },
      {
        category: "pothole" as ReportCategory,
        lng: -84.1449,
        lat: 34.2118,
        total: 6,
        open_count: 1,
        episodes: 3,
        first_seen: "2026-03-04",
        last_seen: "2026-06-28",
      },
    ].map(enrich);
  }

  const rows = await rpcRows<{
    category: ReportCategory;
    lng: number;
    lat: number;
    total: number;
    open_count: number;
    episodes: number;
    first_seen: string;
    last_seen: string;
  }>("analytics_recurring_hotspots", cityId, {
    _min_count: minCount,
    _min_episodes: minEpisodes,
  });
  return rows.map((r) =>
    enrich({
      category: r.category,
      lng: Number(r.lng),
      lat: Number(r.lat),
      total: Number(r.total),
      open_count: Number(r.open_count),
      episodes: Number(r.episodes),
      first_seen: r.first_seen,
      last_seen: r.last_seen,
    }),
  );
}
