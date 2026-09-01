import type {
  AnalyticsKpis,
  CategoryResolution,
  HeatCell,
  NeighborhoodVolume,
  RecurringHotspot,
  ReporterVelocity,
  ResolutionBucket,
  SeveritySlice,
  StatusFunnelStep,
  TrendPoint,
} from "@/lib/analytics-data";
import {
  CATEGORY_SLA_TARGETS,
  categoryMeta,
  categorySlaHours,
  type DashboardReport,
} from "@/lib/dashboard-data";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { DAY_MS, HOUR_MS } from "@/lib/utils/time-constants";

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

const RESOLVED_STATUSES: ReadonlySet<ReportStatus> = new Set([
  "closed",
  "merged",
]);
const BACKLOG_STATUSES: ReadonlySet<ReportStatus> = new Set([
  "open",
  "dispatched",
  "in_progress",
]);

/* ---------------------------- KPIs ---------------------------- */

function resolutionRate(reports: DashboardReport[]): number {
  if (!reports.length) return 0;
  const resolved = reports.filter((r) =>
    RESOLVED_STATUSES.has(r.status),
  ).length;
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
    (r) => resolutionHours(r) <= categorySlaHours(r.category),
  ).length;
  return (met / closed.length) * 100;
}

export function deriveKpis(
  current: DashboardReport[],
  previous: DashboardReport[],
  /**
   * Whether `current`/`previous` came from the synthetic corpus. This function
   * is pure arithmetic over whatever rows it is handed, so only the caller can
   * know, and the dashboard has to label illustrative numbers as illustrative.
   */
  synthetic = false,
): AnalyticsKpis {
  const currRate = resolutionRate(current);
  const prevRate = resolutionRate(previous);
  const currMttr = mttr(current);
  const prevMttr = mttr(previous);
  const currBacklog = backlog(current);
  const prevBacklog = backlog(previous);

  return {
    synthetic,
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
    // created day. A close time can fall in the future (created_at + resolution),
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

// No neighborhood field in the corpus, bucket by street name (the address
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
      label: categoryMeta(category).label,
      color: categoryMeta(category).color,
      avg_hours: v.closedHours.length
        ? Math.round(
            v.closedHours.reduce((s, h) => s + h, 0) / v.closedHours.length,
          )
        : 0,
      target_hours: categorySlaHours(category),
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

/* --------------------- Recurring hotspots --------------------- */

// ISO-ish week bucket (year-week) for episode counting. Uses UTC to stay
// deterministic across the client's timezone.
function weekKey(ms: number): string {
  const d = new Date(ms);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.floor((ms - jan1) / (7 * DAY_MS));
  return `${d.getUTCFullYear()}-${week}`;
}

/**
 * OUTFLANK #41, recurring-problem detection (client-side mirror of the
 * `analytics_recurring_hotspots` RPC in migration 037). Groups the filtered set
 * by category and a ~111m coordinate grid (3-decimal round), surfacing spots
 * where the same problem recurs across >= minEpisodes distinct weeks. A spot
 * reported 6 times in one week is one incident, not a recurring pattern, so
 * recurrence is measured in distinct weeks, not raw count.
 */
export function deriveRecurringHotspots(
  reports: DashboardReport[],
  minCount = 3,
  minEpisodes = 2,
): RecurringHotspot[] {
  const cells = new Map<
    string,
    {
      category: ReportCategory;
      lngSum: number;
      latSum: number;
      total: number;
      open: number;
      weeks: Set<string>;
      first: number;
      last: number;
    }
  >();

  for (const r of reports) {
    if (RESOLVED_STATUSES.has(r.status) && r.status === "merged") continue;
    const gLng = Math.round(r.location.lng * 1000) / 1000;
    const gLat = Math.round(r.location.lat * 1000) / 1000;
    const key = `${r.category}|${gLng}|${gLat}`;
    const t = Date.parse(r.created_at);
    const cell = cells.get(key) ?? {
      category: r.category,
      lngSum: 0,
      latSum: 0,
      total: 0,
      open: 0,
      weeks: new Set<string>(),
      first: t,
      last: t,
    };
    cell.lngSum += r.location.lng;
    cell.latSum += r.location.lat;
    cell.total++;
    if (BACKLOG_STATUSES.has(r.status)) cell.open++;
    cell.weeks.add(weekKey(t));
    cell.first = Math.min(cell.first, t);
    cell.last = Math.max(cell.last, t);
    cells.set(key, cell);
  }

  return Array.from(cells.values())
    .filter((c) => c.total >= minCount && c.weeks.size >= minEpisodes)
    .map((c) => ({
      category: c.category,
      label: categoryMeta(c.category).label,
      color: categoryMeta(c.category).color,
      lng: c.lngSum / c.total,
      lat: c.latSum / c.total,
      total: c.total,
      open_count: c.open,
      episodes: c.weeks.size,
      first_seen: dayKey(c.first),
      last_seen: dayKey(c.last),
    }))
    .sort((a, b) => b.episodes - a.episodes || b.total - a.total);
}

/* --------------------- Backlog age + SLA risk --------------------- */

/**
 * Aging profile of the OPEN backlog (open/dispatched/in_progress), bucketed by
 * how long each has been waiting. A growing tail in the older buckets is the
 * leading indicator of trouble. It shows up before SLA breaches do. Reuses the
 * resolution-distribution buckets, but measured on age-since-filed, not
 * time-to-close. Closed/merged/rejected are excluded.
 */
export function deriveBacklogAgeDistribution(
  reports: DashboardReport[],
  now = Date.now(),
): ResolutionBucket[] {
  const counts = BUCKETS.map(() => 0);
  for (const r of reports) {
    if (!BACKLOG_STATUSES.has(r.status)) continue;
    const ageH = Math.max(0, (now - Date.parse(r.created_at)) / HOUR_MS);
    const idx = BUCKETS.findIndex((b) => ageH <= b.hours_max);
    counts[idx === -1 ? BUCKETS.length - 1 : idx]++;
  }
  return BUCKETS.map((b, i) => ({ ...b, count: counts[i] }));
}

export interface SlaRisk {
  /** Backlog items comfortably within their category SLA window. */
  on_track: number;
  /** Backlog items past 80% of their window but not yet breached. */
  at_risk: number;
  /** Backlog items already past their category SLA window. */
  breached: number;
}

const SLA_RISK_THRESHOLD = 0.8;

/**
 * Classify the OPEN backlog against each report's per-category SLA target
 * (CATEGORY_SLA_TARGETS, in hours). Pure, no due_at column needed; the target
 * is derived from category, age from created_at. Lets an operator see what's
 * about to breach, not just what already has.
 */
export function deriveSlaRisk(
  reports: DashboardReport[],
  now = Date.now(),
): SlaRisk {
  let on_track = 0;
  let at_risk = 0;
  let breached = 0;
  for (const r of reports) {
    if (!BACKLOG_STATUSES.has(r.status)) continue;
    const ageH = Math.max(0, (now - Date.parse(r.created_at)) / HOUR_MS);
    const target = categorySlaHours(r.category);
    if (ageH >= target) breached++;
    else if (ageH >= target * SLA_RISK_THRESHOLD) at_risk++;
    else on_track++;
  }
  return { on_track, at_risk, breached };
}

/* --------------------- Needs-attention triage --------------------- */

export interface AttentionItem {
  id: string;
  category: ReportCategory;
  status: ReportStatus;
  address: string;
  severity: number;
  created_at: string;
  /** Hours since filed. Used for tie-break ranking and the breach flag. */
  age_hours: number;
  /** Already past its per-category SLA window. */
  breaches_sla: boolean;
}

/**
 * The top open items an operator should look at right now. Only the OPEN
 * backlog (open/dispatched/in_progress) is eligible. Ranked severity-first, a
 * fresh Sev-5 outranks a stale Sev-2, then oldest-first within a tier, so the
 * most urgent, longest-waiting reports float up. Pure; `now` is injectable for
 * tests.
 */
export function deriveNeedsAttention(
  reports: DashboardReport[],
  now = Date.now(),
  limit = 5,
): AttentionItem[] {
  return reports
    .filter((r) => BACKLOG_STATUSES.has(r.status))
    .map((r) => {
      const age_hours = Math.max(0, (now - Date.parse(r.created_at)) / HOUR_MS);
      return {
        id: r.id,
        category: r.category,
        status: r.status,
        address: r.address,
        severity: r.severity,
        created_at: r.created_at,
        age_hours,
        breaches_sla: age_hours >= categorySlaHours(r.category),
      };
    })
    .sort((a, b) => b.severity - a.severity || b.age_hours - a.age_hours)
    .slice(0, limit);
}
