import {
  type DashboardReport,
  CATEGORY_META,
  CATEGORY_SLA_TARGETS,
} from "@/lib/dashboard-data";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import type {
  AnalyticsKpis,
  CategoryResolution,
  HeatCell,
  NeighborhoodVolume,
  ReporterVelocity,
  ResolutionBucket,
  SeveritySlice,
  StatusFunnelStep,
  TrendPoint,
} from "@/lib/analytics-data";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Synthetic time-to-resolution. The corpus has no closed_at; this mirrors the
// formula in fetchCityStats so MTTR is consistent across surfaces.
function resolutionHours(r: DashboardReport): number {
  return 12 + r.severity * 18;
}

function closeTime(r: DashboardReport): number | null {
  if (r.status !== "closed") return null;
  return Date.parse(r.created_at) + resolutionHours(r) * HOUR_MS;
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const RESOLVED_STATUSES: ReadonlySet<ReportStatus> = new Set(["closed", "merged"]);
const BACKLOG_STATUSES: ReadonlySet<ReportStatus> = new Set([
  "open",
  "dispatched",
  "in_progress",
]);

/* ---------------------------- KPIs ---------------------------- */

function resolutionRate(reports: DashboardReport[]): number {
  if (!reports.length) return 0;
  const resolved = reports.filter((r) => RESOLVED_STATUSES.has(r.status)).length;
  return (resolved / reports.length) * 100;
}

function mttr(reports: DashboardReport[]): number {
  const closed = reports.filter((r) => r.status === "closed");
  if (!closed.length) return 0;
  return closed.reduce((s, r) => s + resolutionHours(r), 0) / closed.length;
}

function backlog(reports: DashboardReport[]): number {
  return reports.filter((r) => BACKLOG_STATUSES.has(r.status)).length;
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

// SLA compliance: share of closed reports resolved within their category target.
function slaCompliance(reports: DashboardReport[]): number {
  const closed = reports.filter((r) => r.status === "closed");
  if (!closed.length) return 0;
  const met = closed.filter(
    (r) => resolutionHours(r) <= CATEGORY_SLA_TARGETS[r.category],
  ).length;
  return (met / closed.length) * 100;
}

export function deriveKpis(
  current: DashboardReport[],
  previous: DashboardReport[],
): AnalyticsKpis {
  const currRate = resolutionRate(current);
  const prevRate = resolutionRate(previous);
  const currMttr = mttr(current);
  const prevMttr = mttr(previous);
  const currBacklog = backlog(current);
  const prevBacklog = backlog(previous);

  return {
    resolution_rate_pct: round1(currRate),
    // delta in percentage points (matches the "vs prior window" framing)
    resolution_rate_delta_pct: round1(currRate - prevRate),
    mttr_hours: Math.round(currMttr),
    mttr_delta_pct: round1(pctDelta(currMttr, prevMttr)),
    sla_compliance_pct: round1(slaCompliance(current)),
    sla_target_pct: 90,
    active_backlog: currBacklog,
    backlog_delta_pct: round1(pctDelta(currBacklog, prevBacklog)),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ---------------------------- Trend ---------------------------- */

// One point per calendar day spanned by the filtered set. `created` counts
// reports opened that day; `closed` counts synthetic close events that day.
export function deriveTrend(reports: DashboardReport[]): TrendPoint[] {
  if (!reports.length) return [];

  const created = new Map<string, number>();
  const closed = new Map<string, number>();
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;

  for (const r of reports) {
    const t = Date.parse(r.created_at);
    minMs = Math.min(minMs, t);
    maxMs = Math.max(maxMs, t);
    const k = dayKey(t);
    created.set(k, (created.get(k) ?? 0) + 1);

    // Count the synthetic close event, but never extend the axis past the last
    // created day — a close time can fall in the future (created_at + resolution),
    // which would tail the chart out to empty days where `created` is 0.
    const ct = closeTime(r);
    if (ct !== null) {
      const ck = dayKey(ct);
      closed.set(ck, (closed.get(ck) ?? 0) + 1);
    }
  }

  const points: TrendPoint[] = [];
  const startDay = Date.parse(`${dayKey(minMs)}T00:00:00.000Z`);
  const endDay = Date.parse(`${dayKey(maxMs)}T00:00:00.000Z`);
  for (let d = startDay; d <= endDay; d += DAY_MS) {
    const k = dayKey(d);
    points.push({
      date: k,
      created: created.get(k) ?? 0,
      closed: closed.get(k) ?? 0,
    });
  }
  return points;
}

/* ---------------------- Resolution buckets ---------------------- */

const BUCKETS: ReadonlyArray<{ label: string; hours_max: number }> = [
  { label: "<24h", hours_max: 24 },
  { label: "1-3d", hours_max: 72 },
  { label: "3-7d", hours_max: 168 },
  { label: "1-2w", hours_max: 336 },
  { label: ">2w", hours_max: 9999 },
];

export function deriveResolutionDistribution(
  reports: DashboardReport[],
): ResolutionBucket[] {
  const counts = BUCKETS.map(() => 0);
  for (const r of reports) {
    if (r.status !== "closed") continue;
    const h = resolutionHours(r);
    const idx = BUCKETS.findIndex((b) => h <= b.hours_max);
    counts[idx === -1 ? BUCKETS.length - 1 : idx]++;
  }
  return BUCKETS.map((b, i) => ({ ...b, count: counts[i] }));
}

/* ------------------------- Status funnel ------------------------- */

const FUNNEL_ORDER: ReadonlyArray<{ status: ReportStatus; label: string }> = [
  { status: "open", label: "Open" },
  { status: "dispatched", label: "Dispatched" },
  { status: "in_progress", label: "In progress" },
  { status: "closed", label: "Resolved" },
];

export function deriveStatusFunnel(
  reports: DashboardReport[],
): StatusFunnelStep[] {
  return FUNNEL_ORDER.map(({ status, label }) => ({
    status,
    label,
    count: reports.filter((r) => r.status === status).length,
  }));
}

/* ----------------------- Severity slices ----------------------- */

export function deriveSeverityDistribution(
  reports: DashboardReport[],
): SeveritySlice[] {
  const sev = [1, 2, 3, 4, 5] as const;
  return sev.map((severity) => ({
    severity,
    count: reports.filter((r) => r.severity === severity).length,
  }));
}

/* --------------------------- Heatmap --------------------------- */

export function deriveHourlyHeatmap(reports: DashboardReport[]): HeatCell[] {
  const grid = new Map<string, number>();
  for (const r of reports) {
    const d = new Date(r.created_at);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }
  const cells: HeatCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ day, hour, count: grid.get(`${day}-${hour}`) ?? 0 });
    }
  }
  return cells;
}

/* ------------------------ Neighborhoods ------------------------ */

// No neighborhood field in the corpus — bucket by street name (the address
// tail after the house number) as a stable proxy.
export function deriveTopNeighborhoods(
  reports: DashboardReport[],
  limit = 6,
): NeighborhoodVolume[] {
  const byStreet = new Map<string, { count: number; open: number }>();
  for (const r of reports) {
    const street = r.address.replace(/^\d+\s+/, "").trim() || "Unknown";
    const entry = byStreet.get(street) ?? { count: 0, open: 0 };
    entry.count++;
    if (BACKLOG_STATUSES.has(r.status)) entry.open++;
    byStreet.set(street, entry);
  }
  return Array.from(byStreet.entries())
    .map(([name, v]) => ({ name, count: v.count, open: v.open }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* --------------------- Category resolution --------------------- */

export function deriveCategoryResolution(
  reports: DashboardReport[],
): CategoryResolution[] {
  const byCat = new Map<
    ReportCategory,
    { count: number; closedHours: number[] }
  >();
  for (const r of reports) {
    const entry = byCat.get(r.category) ?? { count: 0, closedHours: [] };
    entry.count++;
    if (r.status === "closed") entry.closedHours.push(resolutionHours(r));
    byCat.set(r.category, entry);
  }
  return Array.from(byCat.entries())
    .map(([category, v]) => ({
      category,
      label: CATEGORY_META[category].label,
      color: CATEGORY_META[category].color,
      avg_hours: v.closedHours.length
        ? Math.round(
            v.closedHours.reduce((s, h) => s + h, 0) / v.closedHours.length,
          )
        : 0,
      target_hours: CATEGORY_SLA_TARGETS[category],
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/* ----------------------- Reporter velocity ----------------------- */

export function deriveReporterVelocity(
  reports: DashboardReport[],
  now = Date.now(),
): ReporterVelocity {
  const unique = new Set(reports.map((r) => r.reporter_id));
  const uniqueCount = unique.size;

  // Spark: reports per day over the last 14 days relative to `now`.
  const spark = Array.from({ length: 14 }, () => 0);
  const windowStart = now - 14 * DAY_MS;
  for (const r of reports) {
    const t = Date.parse(r.created_at);
    if (t < windowStart || t > now) continue;
    const idx = Math.min(13, Math.floor((t - windowStart) / DAY_MS));
    spark[idx]++;
  }

  return {
    unique_reporters: uniqueCount,
    reports_per_reporter: uniqueCount
      ? round1(reports.length / uniqueCount)
      : 0,
    spark,
  };
}
