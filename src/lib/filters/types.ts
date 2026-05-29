import type { ReportCategory, ReportStatus } from "@/lib/types";
import type { TeamId } from "@/lib/teams";

export type DateRangePreset = "7d" | "14d" | "30d" | "90d" | "all" | "custom";

export interface ReportFilter {
  preset: DateRangePreset;
  from: string | null; // ISO date, only meaningful when preset === "custom"
  to: string | null;
  categories: ReportCategory[]; // empty = all categories
  minSeverity: 1 | 2 | 3 | 4 | 5;
  statuses: ReportStatus[]; // empty = all statuses
  team: TeamId; // "all" = no team scoping (admin); any other = only that team's reports
}

export const DEFAULT_FILTER: ReportFilter = {
  preset: "14d",
  from: null,
  to: null,
  categories: [],
  minSeverity: 1,
  statuses: [],
  team: "all",
};

// Maps a non-custom preset to a lookback window in days. "all" = no lower bound.
export const PRESET_DAYS: Record<Exclude<DateRangePreset, "custom" | "all">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  "7d": "7 days",
  "14d": "14 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
  custom: "Custom",
};
