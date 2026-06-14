import { CATEGORY_META } from "@/lib/dashboard-data";
import {
  type DateRangePreset,
  DEFAULT_FILTER,
  type ReportFilter,
} from "@/lib/filters/types";
import { isValidTeamId } from "@/lib/teams";
import type { ReportCategory, ReportStatus } from "@/lib/types";

const VALID_PRESETS: ReadonlySet<DateRangePreset> = new Set([
  "7d",
  "14d",
  "30d",
  "90d",
  "all",
  "custom",
]);

const VALID_CATEGORIES = new Set(
  Object.keys(CATEGORY_META) as ReportCategory[],
);

const VALID_STATUSES = new Set<ReportStatus>([
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
]);

// Serializes a filter to URL params, omitting anything at its default so the
// URL stays clean (?range=30d only appears when not the default).
export function filterToParams(filter: ReportFilter): URLSearchParams {
  const p = new URLSearchParams();

  if (filter.preset !== DEFAULT_FILTER.preset) p.set("range", filter.preset);
  if (filter.preset === "custom") {
    if (filter.from) p.set("from", filter.from);
    if (filter.to) p.set("to", filter.to);
  }
  if (filter.categories.length) p.set("cat", filter.categories.join(","));
  if (filter.minSeverity !== DEFAULT_FILTER.minSeverity) {
    p.set("minSev", String(filter.minSeverity));
  }
  if (filter.statuses.length) p.set("status", filter.statuses.join(","));
  if (filter.team !== DEFAULT_FILTER.team) p.set("team", filter.team);

  return p;
}

// Parses a filter from URL params, falling back to defaults for anything
// missing or invalid. Never throws on malformed input.
export function parseFilterFromParams(
  params: URLSearchParams | ReadonlyMap<string, string>,
): ReportFilter {
  const get = (k: string): string | null =>
    params instanceof URLSearchParams ? params.get(k) : (params.get(k) ?? null);

  const rawPreset = get("range");
  const preset: DateRangePreset =
    rawPreset && VALID_PRESETS.has(rawPreset as DateRangePreset)
      ? (rawPreset as DateRangePreset)
      : DEFAULT_FILTER.preset;

  const from = preset === "custom" ? get("from") : null;
  const to = preset === "custom" ? get("to") : null;

  const categories = (get("cat") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ReportCategory =>
      VALID_CATEGORIES.has(s as ReportCategory),
    );

  const rawSev = Number.parseInt(get("minSev") ?? "", 10);
  const minSeverity = (
    rawSev >= 1 && rawSev <= 5 ? rawSev : DEFAULT_FILTER.minSeverity
  ) as ReportFilter["minSeverity"];

  const statuses = (get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ReportStatus => VALID_STATUSES.has(s as ReportStatus));

  const rawTeam = get("team");
  const team =
    rawTeam && isValidTeamId(rawTeam) ? rawTeam : DEFAULT_FILTER.team;

  return { preset, from, to, categories, minSeverity, statuses, team };
}

export function paramsToQueryString(params: URLSearchParams): string {
  const s = params.toString();
  return s ? `?${s}` : "";
}
