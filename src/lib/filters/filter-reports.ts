import type { DashboardReport } from "@/lib/dashboard-data";
import { type ReportFilter, PRESET_DAYS } from "@/lib/filters/types";
import { categoryToTeam } from "@/lib/teams";

const DAY_MS = 86_400_000;

// Resolves a filter's date window to [lowerMs, upperMs] epoch bounds.
// Returns null bounds where unconstrained (e.g. "all" has no lower bound).
export function resolveWindow(
  filter: ReportFilter,
  now = Date.now(),
): { lower: number | null; upper: number | null } {
  if (filter.preset === "all") return { lower: null, upper: null };

  if (filter.preset === "custom") {
    const lower = filter.from ? Date.parse(filter.from) : null;
    // Custom "to" is inclusive of the whole day.
    const upper = filter.to ? Date.parse(filter.to) + DAY_MS : null;
    return {
      lower: Number.isNaN(lower as number) ? null : lower,
      upper: Number.isNaN(upper as number) ? null : upper,
    };
  }

  return { lower: now - PRESET_DAYS[filter.preset] * DAY_MS, upper: null };
}

// Pure filter: applies date window, category set, min severity, and status set.
// Empty category/status arrays mean "no constraint". Single source of truth so
// the map, stat cards, and analytics all narrow the corpus identically.
export function filterReports(
  reports: DashboardReport[],
  filter: ReportFilter,
  now = Date.now(),
): DashboardReport[] {
  const { lower, upper } = resolveWindow(filter, now);
  const catSet = filter.categories.length ? new Set(filter.categories) : null;
  const statusSet = filter.statuses.length ? new Set(filter.statuses) : null;

  return reports.filter((r) => {
    if (filter.team !== "all" && categoryToTeam(r.category) !== filter.team) {
      return false;
    }
    if (catSet && !catSet.has(r.category)) return false;
    if (statusSet && !statusSet.has(r.status)) return false;
    if (r.severity < filter.minSeverity) return false;

    if (lower !== null || upper !== null) {
      const t = Date.parse(r.created_at);
      if (lower !== null && t < lower) return false;
      if (upper !== null && t >= upper) return false;
    }
    return true;
  });
}

// The immediately-preceding window of equal length — used to compute KPI deltas
// (e.g. "resolution rate vs. previous 30 days"). Returns the filtered reports
// for that prior window. "all" has no prior window, so returns [].
export function filterPreviousWindow(
  reports: DashboardReport[],
  filter: ReportFilter,
  now = Date.now(),
): DashboardReport[] {
  const { lower, upper } = resolveWindow(filter, now);
  if (lower === null) return []; // "all" or unbounded — no comparable prior window
  const windowUpper = upper ?? now;
  const windowLen = windowUpper - lower;
  const prevLower = lower - windowLen;
  const prevUpper = lower;

  const catSet = filter.categories.length ? new Set(filter.categories) : null;
  const statusSet = filter.statuses.length ? new Set(filter.statuses) : null;

  return reports.filter((r) => {
    if (filter.team !== "all" && categoryToTeam(r.category) !== filter.team) {
      return false;
    }
    if (catSet && !catSet.has(r.category)) return false;
    if (statusSet && !statusSet.has(r.status)) return false;
    if (r.severity < filter.minSeverity) return false;
    const t = Date.parse(r.created_at);
    return t >= prevLower && t < prevUpper;
  });
}
