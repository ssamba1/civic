import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/client";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[impact-export]");

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────────────────

type Row = string[];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/"/g, '""');
}

function row(...cols: unknown[]): Row {
  return cols.map((c) => `"${cell(c)}"`);
}

function toCsv(rows: Row[]): string {
  return rows.map((r) => r.join(",")).join("\r\n");
}

// Format a number nicely: round to 1dp, add commas.
function n(v: unknown, decimals = 1): string {
  if (v === null || v === undefined) return "N/A — no data yet";
  const num = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(num)) return "N/A — no data yet";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(v: unknown): string {
  if (v === null || v === undefined) return "N/A — no data yet";
  return `${n(v)}%`;
}

function dollars(v: unknown): string {
  if (v === null || v === undefined) return "N/A — no data yet";
  const num = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(num)) return "N/A — no data yet";
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Pull a baseline value from the baselines object, formatted as text.
function baseline(
  baselines: Record<string, { value?: number; text?: string; period?: string }>,
  key: string,
  formatter: (v: unknown) => string = n,
): string {
  const b = baselines[key];
  if (!b) return "Not set — enter via Supabase city_baselines table";
  const display = b.text ?? (b.value !== undefined ? formatter(b.value) : "");
  return b.period ? `${display} (${b.period})` : display;
}

// Build per-category rows for a JSONB object like { pothole: 72.1, ... }
function categoryRows(
  section: string,
  label: string,
  obj: Record<string, unknown>,
  formatter: (v: unknown) => string,
  unit: string,
  period: string,
  notes: string,
): Row[] {
  if (!obj || Object.keys(obj).length === 0) return [];
  return Object.entries(obj)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([cat, val]) =>
      row(section, `${label} — ${cat.replace(/_/g, " ")}`, formatter(val), unit, period, "—", notes),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the full CSV from metric data
// ─────────────────────────────────────────────────────────────────────────────

type Metrics = Record<string, unknown>;
type Baselines = Record<string, { value?: number; text?: string; period?: string; source?: string }>;

function buildCsvRows(m: Metrics, bl: Baselines, generatedAt: string): Row[] {
  const period =
    m.earliest_report_date && m.latest_report_date
      ? `${m.earliest_report_date} → ${m.latest_report_date}`
      : "All time";

  const rows: Row[] = [
    // ── Title block ───────────────────────────────────────────────────────────
    row("Civic Impact Report", `Generated: ${generatedAt}`, "", "", "", "", ""),
    row(
      "Instructions",
      "Filter by 'Section' column to view each category. 'Pre-Civic Baseline' column requires manual entry in city_baselines table.",
      "",
      "",
      "",
      "",
      "",
    ),
    row("", "", "", "", "", "", ""),

    // ── Header ────────────────────────────────────────────────────────────────
    row(
      "Section",
      "Question / Metric",
      "Answer",
      "Unit",
      "Period",
      "Pre-Civic Baseline",
      "Source / Denominator",
    ),

    // ── HEADLINE METRICS ─────────────────────────────────────────────────────
    row(
      "HEADLINE METRICS",
      "Total reports submitted",
      n(m.total_reports, 0),
      "reports",
      period,
      baseline(bl, "total_reports_before", (v) => n(v, 0)),
      "reports table; excludes rejected",
    ),
    row(
      "HEADLINE METRICS",
      "Total residents served",
      n(m.unique_residents, 0),
      "unique users",
      period,
      "—",
      "distinct reporter_id values",
    ),
    row(
      "HEADLINE METRICS",
      "City departments or crews actively using Civic",
      n(m.departments_active, 0),
      "departments",
      period,
      "—",
      "distinct department in work_orders",
    ),
    row(
      "HEADLINE METRICS",
      "Percent of reports classified automatically by AI",
      pct(m.pct_classified_automatically),
      "%",
      period,
      baseline(bl, "pct_classified_automatically_before"),
      "classifications with confidence > 0 / total reports",
    ),
    row(
      "HEADLINE METRICS",
      "AI first-pass routing accuracy (no staff override needed)",
      pct(m.pct_correct_first_pass_routing),
      "%",
      period,
      baseline(bl, "routing_accuracy_before"),
      "(classified − overridden) / classified",
    ),
    row(
      "HEADLINE METRICS",
      "Median time from photo upload to AI triage",
      `${n(m.median_upload_to_classify_min)} min`,
      "minutes",
      period,
      baseline(bl, "manual_triage_min_per_report_before", (v) => `${n(v)} min`),
      "classifications.created_at − reports.created_at (median)",
    ),
    row(
      "HEADLINE METRICS",
      "Median time from report to resolution",
      `${n(m.median_report_to_resolution_hrs)} hrs`,
      "hours",
      period,
      baseline(bl, "avg_resolution_hrs_before", (v) => `${n(v)} hrs`),
      "work_orders.completed_at − reports.created_at (median)",
    ),
    row(
      "HEADLINE METRICS",
      "Duplicate reports merged (removed from staff workload)",
      n(m.total_duplicates_merged, 0),
      "reports",
      period,
      "—",
      "merges table",
    ),
    row(
      "HEADLINE METRICS",
      "Overall resolution rate",
      pct(m.overall_resolution_rate_pct),
      "%",
      period,
      baseline(bl, "resolution_rate_pct_before"),
      "closed / (total − rejected − merged)",
    ),
    row(
      "HEADLINE METRICS",
      "Reports resolved within 7 days (SLA compliance)",
      pct(m.pct_resolved_within_7d),
      "% of resolved",
      period,
      baseline(bl, "sla_7d_pct_before"),
      "completed_at − created_at < 7 days / total resolved",
    ),

    // separator
    row("", "", "", "", "", "", ""),

    // ── REACH ────────────────────────────────────────────────────────────────
    row(
      "REACH",
      "Total reports submitted (all time)",
      n(m.total_reports, 0),
      "reports",
      period,
      baseline(bl, "total_reports_before", (v) => n(v, 0)),
      "excludes rejected status",
    ),
    row(
      "REACH",
      "Reports merged as duplicates",
      n(m.total_merged_as_duplicates, 0),
      "reports",
      period,
      "—",
      "status = merged",
    ),
    row(
      "REACH",
      "Reports rejected / invalid",
      n(m.total_rejected, 0),
      "reports",
      period,
      "—",
      "status = rejected",
    ),
    row(
      "REACH",
      "Total residents served (unique submitters)",
      n(m.unique_residents, 0),
      "unique users",
      period,
      "—",
      "COUNT DISTINCT reporter_id",
    ),
    row(
      "REACH",
      "Number of city departments or crews using Civic",
      n(m.departments_active, 0),
      "departments",
      period,
      "—",
      "distinct departments with work orders",
    ),
    row(
      "REACH",
      "Neighborhoods / census tracts covered",
      "Requires census tract overlay",
      "tracts",
      period,
      "—",
      "PostGIS location data available; overlay census shapefile to compute",
    ),
    row(
      "REACH",
      "Percentage of reports from first-time submitters",
      pct(m.first_time_submitter_pct),
      "%",
      period,
      "—",
      "reporters with exactly 1 report / all reporters",
    ),
    row(
      "REACH",
      "Percentage of residents who submitted more than once",
      pct(m.repeat_submitter_pct),
      "%",
      period,
      "—",
      "reporters with 2+ reports / all reporters",
    ),
    row(
      "REACH",
      "Total upvotes on reports (community backing)",
      n(m.total_upvotes, 0),
      "upvotes",
      period,
      "—",
      "verifications table, vote = confirmed",
    ),
    row(
      "REACH",
      "Percent of reports that include a written description",
      pct(m.reports_with_descriptions_pct),
      "%",
      period,
      "—",
      "engaged reporters who added context beyond the photo",
    ),

    row("", "", "", "", "", "", ""),

    // ── EFFICIENCY ───────────────────────────────────────────────────────────
    row(
      "EFFICIENCY",
      "Median time: photo upload → AI classification (staff triage)",
      `${n(m.median_upload_to_classify_min)} min`,
      "minutes",
      period,
      baseline(bl, "manual_triage_min_per_report_before", (v) => `${n(v)} min`),
      "median; excludes failed classifications",
    ),
    row(
      "EFFICIENCY",
      "90th percentile: photo upload → AI classification",
      `${n(m.p90_upload_to_classify_min)} min`,
      "minutes",
      period,
      "—",
      "worst-case tail; excludes failed classifications",
    ),
    row(
      "EFFICIENCY",
      "Median time: report submitted → work order created (triage done)",
      `${n(m.median_report_to_triage_min)} min`,
      "minutes",
      period,
      baseline(bl, "avg_triage_min_before", (v) => `${n(v)} min`),
      "work_orders.created_at − reports.created_at (median)",
    ),
    row(
      "EFFICIENCY",
      "Median time: report submitted → dispatched to crew",
      `${n(m.median_report_to_dispatch_hrs)} hrs`,
      "hours",
      period,
      baseline(bl, "avg_response_hrs_before", (v) => `${n(v)} hrs`),
      "work_orders.dispatched_at − reports.created_at (median)",
    ),
    row(
      "EFFICIENCY",
      "Median time: report submitted → fully resolved",
      `${n(m.median_report_to_resolution_hrs)} hrs`,
      "hours",
      period,
      baseline(bl, "avg_resolution_hrs_before", (v) => `${n(v)} hrs`),
      "work_orders.completed_at − reports.created_at (median)",
    ),
    row(
      "EFFICIENCY",
      "90th percentile: report submitted → fully resolved",
      `${n(m.p90_report_to_resolution_hrs)} hrs`,
      "hours",
      period,
      "—",
      "worst-case tail; only resolved reports",
    ),
    row(
      "EFFICIENCY",
      "Average days to close a report",
      `${n(m.avg_days_to_close)} days`,
      "days",
      period,
      baseline(bl, "avg_resolution_days_before", (v) => `${n(v)} days`),
      "only closed work orders; denominator = completed_at not null",
    ),
    row(
      "EFFICIENCY",
      "Reduction in manual sorting / triage vs. baseline",
      m.median_upload_to_classify_min !== null &&
        bl["manual_triage_min_per_report_before"]?.value
        ? `${n(bl["manual_triage_min_per_report_before"].value! - Number(m.median_upload_to_classify_min))} min saved per report`
        : "Set pre-Civic baseline to compute",
      "min/report",
      period,
      baseline(bl, "manual_triage_min_per_report_before", (v) => `${n(v)} min`),
      "baseline manual triage time − Civic AI triage time",
    ),
    row(
      "EFFICIENCY",
      "Estimated staff time saved (manual triage reduction × total reports)",
      m.total_reports !== null &&
        bl["manual_triage_min_per_report_before"]?.value &&
        m.median_upload_to_classify_min !== null
        ? `${n((bl["manual_triage_min_per_report_before"].value! - Number(m.median_upload_to_classify_min)) * Number(m.total_reports) / 60, 0)} hours`
        : "Set pre-Civic baseline to compute",
      "total hours",
      period,
      "—",
      "time saved per report × total reports",
    ),

    row("", "", "", "", "", "", ""),

    // ── AI ACCURACY ─────────────────────────────────────────────────────────
    row(
      "AI ACCURACY",
      "Percent of reports classified automatically (vs. manual queue)",
      pct(m.pct_classified_automatically),
      "%",
      period,
      baseline(bl, "pct_classified_automatically_before"),
      "classifications with confidence > 0 / total non-rejected reports",
    ),
    row(
      "AI ACCURACY",
      "Percent of classifications that failed (queued for manual triage)",
      pct(m.pct_classification_failed),
      "%",
      period,
      "—",
      "reports without a confident classification / total",
    ),
    row(
      "AI ACCURACY",
      "First-pass routing accuracy (correct team on first try)",
      pct(m.pct_correct_first_pass_routing),
      "%",
      period,
      baseline(bl, "routing_accuracy_before"),
      "(classified − staff overrides) / classified; source = classification_feedback",
    ),
    row(
      "AI ACCURACY",
      "Total staff routing corrections / overrides",
      n(m.total_classification_overrides, 0),
      "corrections",
      period,
      "—",
      "rows in classification_feedback",
    ),
    row(
      "AI ACCURACY",
      "Average AI confidence score",
      n(m.avg_ai_confidence, 3),
      "0–1 scale",
      period,
      "—",
      "mean of classifications.confidence where confidence > 0",
    ),
    row(
      "AI ACCURACY",
      "Total emergency reports flagged by AI",
      n(m.total_emergency_reports, 0),
      "reports",
      period,
      "—",
      "classifications.is_emergency = true",
    ),
    row(
      "AI ACCURACY",
      "Percent of work orders generated by AI (vs. rules engine)",
      pct(m.pct_ai_generated_work_orders),
      "%",
      period,
      "—",
      "work_orders.wo_source = ai / total work orders",
    ),

    row("", "", "", "", "", "", ""),

    // ── DUPLICATES ───────────────────────────────────────────────────────────
    row(
      "DUPLICATES",
      "Total duplicate reports detected and merged",
      n(m.total_duplicates_merged, 0),
      "reports",
      period,
      baseline(bl, "monthly_duplicate_count_before", (v) => n(v, 0)),
      "merges table; same category + geo radius + time window",
    ),
    row(
      "DUPLICATES",
      "Duplicate merge rate (% of all submissions)",
      pct(m.duplicate_merge_rate_pct),
      "%",
      period,
      baseline(bl, "monthly_duplicate_rate_pct_before"),
      "merges / total reports",
    ),
    row(
      "DUPLICATES",
      "Reduction in duplicate backlog vs. baseline",
      bl["monthly_duplicate_rate_pct_before"]?.value
        ? `${n(Number(bl["monthly_duplicate_rate_pct_before"].value) - Number(m.duplicate_merge_rate_pct))} pp`
        : "Set pre-Civic baseline to compute",
      "percentage points",
      period,
      baseline(bl, "monthly_duplicate_rate_pct_before"),
      "baseline duplicate rate − Civic duplicate rate",
    ),

    row("", "", "", "", "", "", ""),

    // ── RESOLUTION STATUS ────────────────────────────────────────────────────
    row(
      "RESOLUTION STATUS",
      "Total reports resolved / closed",
      n(m.total_resolved, 0),
      "reports",
      period,
      "—",
      "status = closed",
    ),
    row(
      "RESOLUTION STATUS",
      "Total reports currently open",
      n(m.total_open, 0),
      "reports",
      period,
      "—",
      "status = open",
    ),
    row(
      "RESOLUTION STATUS",
      "Total reports dispatched (crew assigned, not yet done)",
      n(m.total_dispatched, 0),
      "reports",
      period,
      "—",
      "status = dispatched",
    ),
    row(
      "RESOLUTION STATUS",
      "Total reports in progress (crew on site)",
      n(m.total_in_progress, 0),
      "reports",
      period,
      "—",
      "status = in_progress",
    ),
    row(
      "RESOLUTION STATUS",
      "Overall resolution rate",
      pct(m.overall_resolution_rate_pct),
      "%",
      period,
      baseline(bl, "resolution_rate_pct_before"),
      "closed / (all − rejected − merged)",
    ),
    row(
      "RESOLUTION STATUS",
      "Backlog reduction vs. baseline",
      bl["resolution_rate_pct_before"]?.value
        ? `+${n(Number(m.overall_resolution_rate_pct) - Number(bl["resolution_rate_pct_before"].value))} pp`
        : "Set pre-Civic baseline to compute",
      "percentage points",
      period,
      baseline(bl, "resolution_rate_pct_before"),
      "Civic resolution rate − baseline resolution rate",
    ),

    row("", "", "", "", "", "", ""),

    // ── SLA COMPLIANCE ───────────────────────────────────────────────────────
    row(
      "SLA COMPLIANCE",
      "Percent of issues resolved within 24 hours",
      pct(m.pct_resolved_within_24h),
      "% of resolved",
      period,
      baseline(bl, "sla_24h_pct_before"),
      "completed_at − created_at < 24h / total resolved",
    ),
    row(
      "SLA COMPLIANCE",
      "Percent of issues resolved within 48 hours",
      pct(m.pct_resolved_within_48h),
      "% of resolved",
      period,
      baseline(bl, "sla_48h_pct_before"),
      "completed_at − created_at < 48h / total resolved",
    ),
    row(
      "SLA COMPLIANCE",
      "Percent of issues resolved within 7 days",
      pct(m.pct_resolved_within_7d),
      "% of resolved",
      period,
      baseline(bl, "sla_7d_pct_before"),
      "completed_at − created_at < 7 days / total resolved",
    ),
    row(
      "SLA COMPLIANCE",
      "Average days to close a report",
      `${n(m.avg_days_to_close)} days`,
      "days",
      period,
      baseline(bl, "avg_resolution_days_before", (v) => `${n(v)} days`),
      "mean of completed_at − created_at; only resolved reports",
    ),
    row(
      "SLA COMPLIANCE",
      "Improvement in average days-to-close vs. baseline",
      m.avg_days_to_close !== null && bl["avg_resolution_days_before"]?.value
        ? `${n(Number(bl["avg_resolution_days_before"].value) - Number(m.avg_days_to_close))} days faster`
        : "Set pre-Civic baseline to compute",
      "days",
      period,
      baseline(bl, "avg_resolution_days_before", (v) => `${n(v)} days`),
      "baseline avg − Civic avg; positive = improvement",
    ),

    row("", "", "", "", "", "", ""),

    // ── EQUITY ───────────────────────────────────────────────────────────────
    row(
      "EQUITY — By Category",
      "Note",
      "Resolution rates and times below reveal which infrastructure types receive faster service. Pair with neighborhood census data for equity analysis.",
      "",
      "",
      "",
      "",
    ),
    ...categoryRows(
      "EQUITY — By Category",
      "Report count",
      (m.reports_by_category as Record<string, unknown>) ?? {},
      (v) => n(v, 0),
      "reports",
      period,
      "excludes rejected and merged",
    ),
    ...categoryRows(
      "EQUITY — By Category",
      "Resolution rate",
      (m.resolution_rate_by_category as Record<string, unknown>) ?? {},
      pct,
      "%",
      period,
      "closed / total per category",
    ),
    ...categoryRows(
      "EQUITY — By Category",
      "Median resolution time",
      (m.median_resolution_hrs_by_category as Record<string, unknown>) ?? {},
      (v) => `${n(v)} hrs`,
      "hours",
      period,
      "only closed work orders per category",
    ),

    row("", "", "", "", "", "", ""),

    // ── COST ────────────────────────────────────────────────────────────────
    row(
      "COST",
      "Total estimated repair cost across all reports",
      dollars(m.total_estimated_repair_cost),
      "USD",
      period,
      "—",
      "SUM work_orders.est_cost",
    ),
    row(
      "COST",
      "Average estimated cost per report",
      dollars(m.avg_estimated_cost_per_report),
      "USD/report",
      period,
      "—",
      "AVG work_orders.est_cost where > 0",
    ),
    row(
      "COST",
      "AI cost estimate accuracy vs. actual repair cost",
      m.cost_accuracy_pct !== null ? pct(m.cost_accuracy_pct) : "N/A — no closed reports with actual cost entered yet",
      "%",
      period,
      "—",
      "requires staff to enter fix_cost_estimate when closing; computed as 100 − mean absolute % error",
    ),

    row("", "", "", "", "", "", ""),

    // ── ENGAGEMENT ───────────────────────────────────────────────────────────
    row(
      "ENGAGEMENT",
      "Total community upvotes on reports",
      n(m.total_upvotes, 0),
      "upvotes",
      period,
      "—",
      "verifications.vote = confirmed",
    ),
    row(
      "ENGAGEMENT",
      "Percent of residents who submitted again (repeat use)",
      pct(m.repeat_submitter_pct),
      "%",
      period,
      "—",
      "reporters with 2+ reports / all reporters",
    ),
    row(
      "ENGAGEMENT",
      "Resident satisfaction / CSAT",
      "N/A — feature not yet instrumented",
      "%",
      period,
      "—",
      "add a CSAT rating step to the report-closed notification flow",
    ),
    row(
      "ENGAGEMENT",
      "Email open rate for status updates",
      "N/A — track via Resend webhook",
      "%",
      period,
      "—",
      "configure Resend open/click webhooks → notifications table",
    ),
    row(
      "ENGAGEMENT",
      "Staff adoption rate",
      "N/A — track via staff_actions table (future migration)",
      "%",
      period,
      "—",
      "actions per staff member / expected workload",
    ),

    row("", "", "", "", "", "", ""),

    // ── DEPARTMENT BREAKDOWN ─────────────────────────────────────────────────
    ...categoryRows(
      "DEPARTMENT BREAKDOWN",
      "Work orders assigned",
      (m.reports_by_department as Record<string, unknown>) ?? {},
      (v) => n(v, 0),
      "work orders",
      period,
      "work_orders.department",
    ),

    row("", "", "", "", "", "", ""),

    // ── PLATFORM ────────────────────────────────────────────────────────────
    row(
      "PLATFORM",
      "Earliest report in database",
      String(m.earliest_report_date ?? "N/A"),
      "date",
      "—",
      "—",
      "MIN reports.created_at",
    ),
    row(
      "PLATFORM",
      "Most recent report in database",
      String(m.latest_report_date ?? "N/A"),
      "date",
      "—",
      "—",
      "MAX reports.created_at",
    ),
    row(
      "PLATFORM",
      "Report generated at",
      String(m.data_generated_at ?? generatedAt),
      "ISO 8601",
      "—",
      "—",
      "UTC timestamp when this CSV was generated",
    ),
    row(
      "PLATFORM",
      "Uptime / AI availability",
      "Track via /api/health endpoint or Sentry",
      "",
      period,
      "—",
      "error_log table + Sentry DSN for AI failure rate",
    ),
  ];

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Auth: require at minimum staff role. The middleware dev fast-path skips
    // Supabase auth, so also allow DEV_AUTH_BYPASS for local testing.
    const isDev = process.env.NODE_ENV === "development";
    const devBypass = isDev && process.env.DEV_AUTH_BYPASS === "1";

    if (!devBypass) {
      const user = await getAuthUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const ssr = await createSSRClient();
      const { data: profile } = await ssr
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (
        !profile ||
        !["staff_dispatcher", "staff_supervisor", "admin"].includes(profile.role)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch metrics — service client bypasses RLS for aggregate reads.
    const db = createServerClient();

    // Fetch the first city's ID for baseline lookup.
    const { data: cityRow } = await db
      .from("cities")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const [metricsResult, baselinesResult] = await Promise.all([
      db.rpc("get_impact_metrics"),
      cityRow?.id
        ? db.rpc("get_baselines", { _city_id: cityRow.id })
        : Promise.resolve({ data: {}, error: null }),
    ]);

    if (metricsResult.error) {
      logger.error("get_impact_metrics failed", metricsResult.error);
      return NextResponse.json(
        { error: "Failed to compute metrics", detail: metricsResult.error.message },
        { status: 500 },
      );
    }

    const metrics = (metricsResult.data as Metrics) ?? {};
    const baselines = (baselinesResult.data as Baselines) ?? {};
    const generatedAt = new Date().toISOString();

    const csvRows = buildCsvRows(metrics, baselines, generatedAt);
    const csv = toCsv(csvRows);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `civic-impact-report-${dateStr}.csv`;

    // UTF-8 BOM (﻿) makes Excel on Windows open the file with correct
    // encoding so → and — characters render properly instead of garbling.
    return new NextResponse("﻿" + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("Unhandled error in impact-export", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
