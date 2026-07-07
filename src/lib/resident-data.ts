import "server-only";

import {
  fetchCategoryResolution,
  fetchReportsTrend,
  fetchResolutionDistribution,
  fetchTopNeighborhoods,
  type TrendPoint,
} from "@/lib/analytics-data";
import type { DashboardReport } from "@/lib/dashboard-data";
import {
  CATEGORY_META,
  fetchCity,
  fetchCityStats,
  getReportCorpus,
} from "@/lib/dashboard-data";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";
import { STATUS_LABEL } from "@/lib/status";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { DAY_MS, HOUR_MS } from "@/lib/utils/time-constants";

const logger = createLogger("resident-data");

/* ------------------------------------------------------------------
   Resident-facing types
   ------------------------------------------------------------------ */

export interface TimelineStep {
  stage: "filed" | "dispatched" | "in_progress" | "resolved";
  label: string;
  at: string | null;
  done: boolean;
  current: boolean;
  note?: string;
}

export interface CityMorale {
  resolvedThisWeek: number;
  resolvedTotal: number;
  avgFixHours: number;
  pctResolved: number;
  openCount: number;
  momentum: "up" | "flat" | "down";
  trend: TrendPoint[];
  topFixedCategories: { category: ReportCategory; count: number }[];
  // Enriched morale signal
  totalReports: number;
  reportedThisWeek: number;
  // Week-over-week percent change; null = "new" (no prior-week base to
  // compare against — see pctChange).
  reportedDeltaPct: number | null;
  resolvedDeltaPct: number | null;
  inProgressCount: number; // dispatched + in_progress
  activeReporters: number; // distinct neighbors who reported
  severity: { severity: 1 | 2 | 3 | 4 | 5; count: number }[];
  topNeighborhoods: { name: string; count: number; resolvedPct: number }[];
  fixSpeed: { label: string; count: number }[]; // resolution-time buckets
  fastestCategory: { category: ReportCategory; hours: number } | null;
}

export interface NotificationItem {
  id: string;
  type: "status" | "resolved" | "announcement" | "comment";
  title: string;
  body: string;
  at: string;
  read: boolean;
  reportId?: string;
  icon?: string;
  reportSnapshot?: {
    category: ReportCategory;
    categoryLabel: string;
    categoryColor: string;
    status: ReportStatus;
    statusLabel: string;
    address: string;
    photoUrl: string;
    filedAt: string;
  };
}

/* ------------------------------------------------------------------
   Shared label/status helpers (mirror recent-reports tones)
   ------------------------------------------------------------------ */

// Deterministic pseudo-random in [0,1) seeded by a report id string + salt.
// Mirrors the corpus seeding style so derived data stays stable across SSR/CSR.
function seededFromId(id: string, salt: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const x = Math.sin(h * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------
   Demo resident — the reporter_id owning the most reports in the corpus.
   SINGLE SOURCE OF TRUTH: every "my" query resolves through this so the
   current resident always matches their own reports.
   ------------------------------------------------------------------ */

// Recomputed per call (no module-global cache): a server module instance is
// shared across concurrent requests, so a once-frozen value would leak the
// first request's answer to everyone (loop-closure plan issue #6). The scan is
// O(corpus) over an in-memory array — negligible.
function demoReporterId(): string {
  const counts = new Map<string, number>();
  for (const r of getReportCorpus()) {
    counts.set(r.reporter_id, (counts.get(r.reporter_id) ?? 0) + 1);
  }
  let best = "reporter-1";
  let bestN = -1;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------
   Synthetic stage timestamps — deterministic, monotonic, after created_at.
   SINGLE SOURCE OF TRUTH for both getReportTimeline and notifications so
   their times never disagree.
     dispatched   +6-24h
     in_progress  +1-2d   (after dispatched)
     resolved     +2-5d   (after in_progress)
   ------------------------------------------------------------------ */

function synthStageTimes(report: DashboardReport): {
  filed: string;
  dispatched: string;
  in_progress: string;
  resolved: string;
} {
  const created = new Date(report.created_at).getTime();
  const dispatched = created + (6 + seededFromId(report.id, 1) * 18) * HOUR_MS;
  const inProgress = dispatched + (1 + seededFromId(report.id, 2)) * DAY_MS;
  const resolved = inProgress + (2 + seededFromId(report.id, 3) * 3) * DAY_MS;
  return {
    filed: report.created_at,
    dispatched: new Date(dispatched).toISOString(),
    in_progress: new Date(inProgress).toISOString(),
    resolved: new Date(resolved).toISOString(),
  };
}

// How far a status has progressed through the linear filed→resolved track.
// merged/rejected are terminal-at-filed (no synthesized later stages).
function reachedStages(status: ReportStatus): {
  dispatched: boolean;
  in_progress: boolean;
  resolved: boolean;
} {
  switch (status) {
    case "dispatched":
      return { dispatched: true, in_progress: false, resolved: false };
    case "in_progress":
      return { dispatched: true, in_progress: true, resolved: false };
    case "closed":
      return { dispatched: true, in_progress: true, resolved: true };
    default: // open | merged | rejected
      return { dispatched: false, in_progress: false, resolved: false };
  }
}

/* ------------------------------------------------------------------
   Public API — DATA CONTRACT
   ------------------------------------------------------------------ */

export async function getCurrentResident(citySlug = "cumming"): Promise<{
  id: string;
  displayName: string;
  citySlug: string;
  isDemo: boolean;
}> {
  // Default to the demo reporter so the surface stays populated for anon/guest
  // visitors and when Supabase is unconfigured. A real signed-in user overrides
  // both id and name below — using their actual auth id, NOT the demo id, so
  // "my" queries scope to the rows they own.
  let id = demoReporterId();
  let displayName = "Cumming Resident";
  let isDemo = true;

  try {
    const user = await getAuthUser();
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const name =
        (typeof meta.display_name === "string" && meta.display_name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        user.email ||
        null;
      if (name) displayName = name;
      id = user.id;
      isDemo = false;
    }
  } catch {
    // Missing/unconfigured Supabase must never throw — stay demo.
  }

  return { id, displayName, citySlug, isDemo };
}

// PostgREST serializes geography(POINT) as GeoJSON (object or string). Decode
// to {lng,lat}; tolerate the rare WKB-hex passthrough by giving up to {0,0}.
function decodeLocation(loc: unknown): { lng: number; lat: number } {
  let geo = loc;
  if (typeof geo === "string") {
    try {
      geo = JSON.parse(geo);
    } catch {
      return { lng: 0, lat: 0 };
    }
  }
  const coords = (geo as { coordinates?: [number, number] })?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    return { lng: coords[0], lat: coords[1] };
  }
  return { lng: 0, lat: 0 };
}

interface MyReportRow {
  id: string;
  status: ReportStatus;
  address: string | null;
  location: unknown;
  photo_public_url: string;
  created_at: string;
  reporter_id: string;
  classifications:
    | { category: ReportCategory | null; severity: number | null }[]
    | { category: ReportCategory | null; severity: number | null }
    | null;
  // 1:1 work order carries the close-out evidence: when it was completed and
  // the resolution ("after") photo a crew uploaded on close. PostgREST returns
  // an embedded one-to-one as an object (or array for some relationship hints).
  work_orders:
    | {
        completed_at: string | null;
        resolution_photo_url: string | null;
        fix_cost_estimate: number | null;
        fix_time_estimate_days: number | null;
        fix_note: string | null;
        marked_under_fix_at: string | null;
      }[]
    | {
        completed_at: string | null;
        resolution_photo_url: string | null;
        fix_cost_estimate: number | null;
        fix_time_estimate_days: number | null;
        fix_note: string | null;
        marked_under_fix_at: string | null;
      }
    | null;
}

/* ------------------------------------------------------------------
   Per-category resolution notes — the "operational transparency" text the
   research (Buell/Porter/Norton) shows is the lever: residents need to see
   WHAT was done, not just a status flip to "Resolved". Used as the synthetic
   close-out note when the live work order carries no human-written note.
   ------------------------------------------------------------------ */
const RESOLUTION_NOTES: Record<ReportCategory, string> = {
  pothole: "Pothole filled and compacted — surface restored and reopened.",
  streetlight:
    "Fixture repaired and relit; circuit tested and back in service.",
  downed_sign: "Sign re-set and re-secured to spec.",
  graffiti: "Surface cleaned and repainted — tag removed.",
  illegal_dump: "Site cleared and debris hauled to the transfer station.",
  water_leak:
    "Leak isolated and repaired; service restored and pressure verified.",
  sidewalk_damage: "Section repaired and leveled — trip hazard removed.",
  tree_down: "Tree cleared and debris chipped; right-of-way reopened.",
  debris: "Debris removed and the area swept clear.",
  drainage: "Drain cleared and flow restored; inlet inspected.",
  faded_signage: "Signage replaced with a fresh, reflective panel.",
  other: "Issue addressed and the report closed out.",
};

// Synthetic fallback: the demo reporter's slice of the corpus. Used whenever the
// live query errors or the signed-in user has no reports, so the demo stays alive.
function myReportsFallback(): DashboardReport[] {
  const mine = demoReporterId();
  // Corpus is already newest-first; filter preserves order.
  return getReportCorpus().filter((r) => r.reporter_id === mine);
}

export async function getMyReports(
  citySlug: string,
): Promise<DashboardReport[]> {
  void citySlug;
  try {
    const supabase = await createSSRClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn("Falling back to synthetic corpus (no authenticated user)");
      return myReportsFallback();
    }

    // RLS (reports_select_own) already scopes to auth.uid(); the explicit
    // reporter_id filter is defense-in-depth and keeps intent obvious.
    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, status, address, location, photo_public_url, created_at, reporter_id, classifications ( category, severity ), work_orders ( completed_at, resolution_photo_url, fix_cost_estimate, fix_time_estimate_days, fix_note, marked_under_fix_at )",
      )
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      logger.warn(
        "Falling back to synthetic corpus (query error or empty result)",
      );
      return myReportsFallback();
    }

    return (data as unknown as MyReportRow[]).map((r) => {
      const cl = Array.isArray(r.classifications)
        ? (r.classifications[0] ?? null)
        : r.classifications;
      const wo = Array.isArray(r.work_orders)
        ? (r.work_orders[0] ?? null)
        : r.work_orders;
      return {
        id: r.id,
        category: (cl?.category ?? "other") as ReportCategory,
        severity: (cl?.severity ?? 3) as 1 | 2 | 3 | 4 | 5,
        status: r.status,
        address: r.address ?? "Unknown location",
        location: decodeLocation(r.location),
        photo_public_url: r.photo_public_url,
        created_at: r.created_at,
        reporter_id: r.reporter_id,
        // Surface the close-out evidence so the resident sees the work done —
        // the operational-transparency payoff. Only populated once closed.
        ...(wo?.completed_at ? { completed_at: wo.completed_at } : {}),
        ...(wo?.resolution_photo_url
          ? { afterPhoto: wo.resolution_photo_url }
          : {}),
        // Admin-set public fix estimates — shown when status is in_progress.
        ...(wo?.fix_cost_estimate != null
          ? { fix_cost_estimate: wo.fix_cost_estimate }
          : {}),
        ...(wo?.fix_time_estimate_days != null
          ? { fix_time_estimate_days: wo.fix_time_estimate_days }
          : {}),
        ...(wo?.fix_note ? { fix_note: wo.fix_note } : {}),
        ...(wo?.marked_under_fix_at
          ? { marked_under_fix_at: wo.marked_under_fix_at }
          : {}),
      };
    });
  } catch (err) {
    logger.warn("Falling back to synthetic corpus (exception)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return myReportsFallback();
  }
}

export async function getMyReport(
  citySlug: string,
  reportId: string,
): Promise<DashboardReport | null> {
  const mine = await getMyReports(citySlug);
  return mine.find((r) => r.id === reportId) ?? null;
}

export async function getReportTimeline(
  citySlug: string,
  reportId: string,
): Promise<TimelineStep[]> {
  const report = await getMyReport(citySlug, reportId);
  if (!report) return [];

  const t = synthStageTimes(report);
  const reached = reachedStages(report.status);
  const terminal = report.status === "merged" || report.status === "rejected";

  const steps: TimelineStep[] = [
    {
      stage: "filed",
      label: "Filed",
      at: t.filed,
      done: true,
      current: false,
    },
    {
      stage: "dispatched",
      label: "Dispatched",
      at: reached.dispatched ? t.dispatched : null,
      done: reached.dispatched,
      current: false,
    },
    {
      stage: "in_progress",
      label: "In progress",
      at: reached.in_progress ? t.in_progress : null,
      done: reached.in_progress,
      current: false,
    },
    {
      stage: "resolved",
      label: "Resolved",
      at: reached.resolved ? t.resolved : null,
      done: reached.resolved,
      current: false,
      // The "what was done" note — operational transparency on close.
      ...(reached.resolved ? { note: RESOLUTION_NOTES[report.category] } : {}),
    },
  ];

  if (terminal) {
    steps[0].note =
      report.status === "merged"
        ? "Merged into a nearby report covering the same issue."
        : "Reviewed and closed — no action needed.";
    steps[0].current = true;
    return steps;
  }

  // current = latest done stage when not fully resolved.
  if (!reached.resolved) {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].done) {
        steps[i].current = true;
        break;
      }
    }
  }

  return steps;
}

export async function getCityMorale(citySlug: string): Promise<CityMorale> {
  const corpus = getReportCorpus();
  const total = corpus.length;
  const closed = corpus.filter((r) => r.status === "closed");
  const resolvedTotal = closed.length;
  const openCount = corpus.filter((r) => r.status === "open").length;

  const now = Date.now();
  const ageDays = (r: DashboardReport) =>
    (now - new Date(r.created_at).getTime()) / DAY_MS;

  // "Resolved this week" must measure when a report was RESOLVED, not when it
  // was filed — a report filed months ago and closed yesterday belongs to this
  // week. The synthetic corpus has no closed_at, so derive the resolution time
  // from the same deterministic stage clock the timeline uses (single source of
  // truth), keeping this metric consistent with what residents see per-report.
  const resolvedAgeDays = (r: DashboardReport) =>
    (now - new Date(synthStageTimes(r).resolved).getTime()) / DAY_MS;

  const resolvedThisWeek = closed.filter((r) => resolvedAgeDays(r) <= 7).length;

  const pctResolved =
    total === 0 ? 0 : Math.round((resolvedTotal / total) * 100);

  // Reuse the dashboard's severity-weighted avg resolution hours.
  const city = await fetchCity(citySlug);
  const stats = await fetchCityStats(city?.id ?? "");
  const avgFixHours = stats.avg_resolution_hours;

  // Momentum: last-week vs prior-week RESOLVED volume (by resolution time, as
  // above), with a small dead-band so tiny count swings read "flat".
  const lastWeek = resolvedThisWeek;
  const priorWeek = closed.filter(
    (r) => resolvedAgeDays(r) > 7 && resolvedAgeDays(r) <= 14,
  ).length;
  const slope = lastWeek - priorWeek;
  const momentum: CityMorale["momentum"] =
    slope > 1 ? "up" : slope < -1 ? "down" : "flat";

  const trend = await fetchReportsTrend(city?.id ?? "", 14, now);

  const catCounts = new Map<ReportCategory, number>();
  for (const r of closed) {
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  }
  const topFixedCategories = Array.from(catCounts.entries())
    .map(([category, count]) => ({ category, count }))
    // Tie-break by category name so equal counts keep a stable order across
    // reloads instead of surfacing in Map-insertion (i.e. arbitrary) order.
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, 5);

  // Week-over-week deltas. 0→N is NOT "+100%" — there is no base to compare
  // against, so it returns null and the UI renders "new" instead (issue #19).
  const pctChange = (cur: number, prev: number): number | null =>
    prev === 0 ? (cur > 0 ? null : 0) : Math.round(((cur - prev) / prev) * 100);

  const reportedThisWeek = corpus.filter((r) => ageDays(r) <= 7).length;
  const reportedPrevWeek = corpus.filter(
    (r) => ageDays(r) > 7 && ageDays(r) <= 14,
  ).length;
  const reportedDeltaPct = pctChange(reportedThisWeek, reportedPrevWeek);
  const resolvedDeltaPct = pctChange(lastWeek, priorWeek);

  const inProgressCount = corpus.filter(
    (r) => r.status === "dispatched" || r.status === "in_progress",
  ).length;

  const activeReporters = new Set(corpus.map((r) => r.reporter_id)).size;

  // Severity mix across everything reported (the city's risk surface).
  const severity = ([1, 2, 3, 4, 5] as const).map((s) => ({
    severity: s,
    count: corpus.filter((r) => r.severity === s).length,
  }));

  // Named areas + how much of each is already handled.
  const neighborhoods = await fetchTopNeighborhoods(city?.id ?? "");
  const topNeighborhoods = neighborhoods.slice(0, 5).map((n) => ({
    name: n.name,
    count: n.count,
    resolvedPct:
      n.count === 0 ? 0 : Math.round(((n.count - n.open) / n.count) * 100),
  }));

  // How quickly issues get closed, bucketed by time-to-resolution.
  const fixSpeed = (await fetchResolutionDistribution(city?.id ?? "")).map(
    (b) => ({ label: b.label, count: b.count }),
  );

  // The category the city turns around fastest (lowest avg hours).
  const catRes = await fetchCategoryResolution(city?.id ?? "");
  const fastestCategory =
    catRes.length === 0
      ? null
      : catRes.reduce((best, c) => (c.avg_hours < best.avg_hours ? c : best));
  const fastest = fastestCategory
    ? {
        category: fastestCategory.category,
        hours: Math.round(fastestCategory.avg_hours),
      }
    : null;

  return {
    resolvedThisWeek,
    resolvedTotal,
    avgFixHours,
    pctResolved,
    openCount,
    momentum,
    trend,
    topFixedCategories,
    totalReports: total,
    reportedThisWeek,
    reportedDeltaPct,
    resolvedDeltaPct,
    inProgressCount,
    activeReporters,
    severity,
    topNeighborhoods,
    fixSpeed,
    fastestCategory: fastest,
  };
}

const ANNOUNCEMENTS: ReadonlyArray<{
  title: string;
  body: string;
  ageDays: number;
  icon: string;
}> = [
  {
    title: "Spring pothole blitz — 120 potholes filled",
    body: "Crews wrapped a week-long paving push across the city's busiest corridors.",
    ageDays: 1,
    icon: "construction",
  },
  {
    title: "New recycling pickup schedule starts Monday",
    body: "Curbside recycling moves to weekly collection citywide. Check your route time.",
    ageDays: 2,
    icon: "recycle",
  },
  {
    title: "Town hall: infrastructure budget Q&A",
    body: "Bring your questions on roads, water, and parks spending for the coming year.",
    ageDays: 4,
    icon: "megaphone",
  },
  {
    title: "Cumming Greenway phase 2 opens",
    body: "Two new miles of multi-use trail are now open along the creek corridor.",
    ageDays: 6,
    icon: "trees",
  },
];

// Map a persisted notification_type to the resident-facing NotificationItem type.
const NOTIF_TYPE_MAP: Record<string, NotificationItem["type"]> = {
  status_change: "status",
  resolved: "resolved",
  comment: "comment",
  announcement: "announcement",
};

interface NotificationRow {
  id: string;
  report_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export async function getResidentNotifications(
  citySlug: string,
): Promise<NotificationItem[]> {
  try {
    const supabase = await createSSRClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // RLS notifications_select_own scopes to the signed-in user. The table may
      // not be applied to the live DB yet (migration 20260528_006) — a missing
      // table surfaces as a query error, which we treat as "no live rows".
      const { data, error } = await supabase
        .from("notifications")
        .select("id, report_id, type, title, body, read_at, created_at")
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        return (data as NotificationRow[]).map((n) => ({
          id: n.id,
          type: NOTIF_TYPE_MAP[n.type] ?? "status",
          title: n.title,
          body: n.body ?? "",
          at: n.created_at,
          read: n.read_at !== null,
          reportId: n.report_id ?? undefined,
          icon: n.type === "resolved" ? "check-circle" : "wrench",
        }));
      }
    }
  } catch (err) {
    logger.warn("Falling back to synthetic notifications (exception)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return syntheticNotifications(citySlug);
}

async function syntheticNotifications(
  citySlug: string,
): Promise<NotificationItem[]> {
  const mine = await getMyReports(citySlug);
  const now = Date.now();
  const items: NotificationItem[] = [];

  for (const r of mine) {
    // Skip only the terminal-at-filed states (merged/rejected) — those get no
    // progress notification. Everything still moving, INCLUDING a freshly filed
    // "open" report, gets at least a "received" acknowledgement so the resident
    // never files into silence.
    if (r.status === "merged" || r.status === "rejected") {
      continue;
    }

    const t = synthStageTimes(r);
    const at =
      r.status === "closed"
        ? t.resolved
        : r.status === "in_progress"
          ? t.in_progress
          : r.status === "dispatched"
            ? t.dispatched
            : t.filed; // open → acknowledge at filing time
    const label = STATUS_LABEL[r.status];
    const catLabel = CATEGORY_META[r.category].label;
    const isResolved = r.status === "closed";
    const isReceived = r.status === "open";

    items.push({
      id: `notif-${r.id}`,
      type: isResolved ? "resolved" : "status",
      title: isReceived
        ? `A ${catLabel} report was received`
        : `A ${catLabel} report was ${label}`,
      body: isResolved
        ? "Crews finished the fix — thanks to everyone helping keep the city running."
        : isReceived
          ? "Logged and waiting to be picked up. We'll post an update the moment a crew takes it on."
          : `A crew has picked up this report. We'll keep the community posted as it progresses.`,
      at,
      read: now - new Date(at).getTime() > 3 * DAY_MS,
      reportId: r.id,
      icon: isResolved ? "check-circle" : "wrench",
      reportSnapshot: {
        category: r.category,
        categoryLabel: catLabel,
        categoryColor: CATEGORY_META[r.category].color,
        status: r.status,
        statusLabel: label,
        address: r.address,
        photoUrl: r.photo_public_url,
        filedAt: r.created_at,
      },
    });
  }

  // City announcements are demo set-dressing — never show them on live
  // deployments, where notifications must come from real reports only.
  for (let i = 0; DEMO_MODE && i < ANNOUNCEMENTS.length; i++) {
    const a = ANNOUNCEMENTS[i];
    const at = new Date(now - a.ageDays * DAY_MS).toISOString();
    items.push({
      id: `announce-${i + 1}`,
      type: "announcement",
      title: a.title,
      body: a.body,
      at,
      read: now - new Date(at).getTime() > 3 * DAY_MS,
      icon: a.icon,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}
