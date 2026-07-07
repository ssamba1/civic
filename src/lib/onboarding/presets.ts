import { CATEGORY_META } from "@/lib/dashboard-data";
import { categoryToTeamDefault, TEAM_LIST, type TeamMeta } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Onboarding presets — derived from the global team catalog.

   Server-safe: imports only `TEAM_LIST` / `categoryToTeamDefault`
   (static data + the override-free resolver) from teams.ts, never
   `categoryToTeam` (which reads a "use client" snapshot and throws in
   server components). CATEGORY_META is plain data from dashboard-data.
   ================================================================== */

/** The 11 real, selectable team presets ("all" is the admin pseudo-team). */
export const TEAM_PRESETS: TeamMeta[] = TEAM_LIST.filter((t) => t.id !== "all");

/** Every built-in report category, in metadata order. */
export const ALL_CATEGORIES = Object.keys(CATEGORY_META) as ReportCategory[];

/** Human label for a category (e.g. "pothole" → "Pothole"). */
export function categoryLabel(category: ReportCategory): string {
  return CATEGORY_META[category]?.label ?? category;
}

/** Derive a URL-safe slug from a city name (shared by wizard + server). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "city";
}

/** A category → owning-team map, every category assigned to some enabled team. */
export type RoutingMap = Record<ReportCategory, string>;

/**
 * Build the default routing for a set of enabled teams:
 *   - each category routes to its preset default team if that team is enabled;
 *   - otherwise to "general_admin" if enabled;
 *   - otherwise to the first enabled team.
 * Guarantees every category lands on an enabled team (or "" if none enabled).
 */
export function buildDefaultRouting(enabledTeamKeys: string[]): RoutingMap {
  const enabled = new Set(enabledTeamKeys);
  const fallback = enabled.has("general_admin")
    ? "general_admin"
    : (enabledTeamKeys[0] ?? "");

  const map = {} as RoutingMap;
  for (const category of ALL_CATEGORIES) {
    const preset = categoryToTeamDefault(category);
    map[category] = enabled.has(preset) ? preset : fallback;
  }
  return map;
}

/** Invert a routing map into each team's owned categories. */
export function routingToTeamCategories(
  routing: RoutingMap,
): Record<string, ReportCategory[]> {
  const out: Record<string, ReportCategory[]> = {};
  for (const category of ALL_CATEGORIES) {
    const teamKey = routing[category];
    if (!teamKey) continue;
    if (!out[teamKey]) out[teamKey] = [];
    out[teamKey].push(category);
  }
  return out;
}
