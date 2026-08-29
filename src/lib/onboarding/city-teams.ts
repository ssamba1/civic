import { isBuiltinCategory } from "@/lib/ai/categories";
import { createServerClient } from "@/lib/db/client";
import { fetchIssueTypeTeam } from "@/lib/db/issue-types";
import { ALL_CATEGORIES } from "@/lib/onboarding/presets";
import type { CategoryTeamMap } from "@/lib/onboarding/types";
import { categoryToTeamDefault, TEAMS, type TeamId } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";

/* ==================================================================
   Per-city team config reader.

   The DB-backed, per-city replacement for the localStorage routing
   overrides (src/lib/category-overrides.ts). Server-only: uses the
   service-role client. Onboarding writes city_teams; the staff console
   and inbox read it here to resolve which team owns a report.
   ================================================================== */

export interface CityTeamConfig {
  teamKey: string;
  label: string;
  enabled: boolean;
  categories: ReportCategory[];
}

/** A city's enabled teams (empty when the city was not onboarded via the wizard). */
export async function fetchCityTeams(
  cityId: string,
): Promise<CityTeamConfig[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("city_teams")
    .select("team_key, label, enabled, categories")
    .eq("city_id", cityId)
    .eq("enabled", true);
  if (error || !data) return [];
  return data.map((r) => ({
    teamKey: r.team_key as string,
    label: r.label as string,
    enabled: r.enabled as boolean,
    categories: (r.categories ?? []) as ReportCategory[],
  }));
}

/**
 * Which configured team owns a category for this city. Returns null when the
 * city has no matching team config, so callers fall back to the global default
 * (categoryToTeamDefault) rather than dropping the report.
 */
export function resolveCategoryTeam(
  config: CityTeamConfig[],
  category: ReportCategory,
): CityTeamConfig | null {
  return config.find((t) => t.categories.includes(category)) ?? null;
}

/**
 * Resolve the owning TeamId for a category in one city: the city's onboarded
 * config first, the static preset default otherwise. The write-time resolver
 * for work_orders.team_key (classify pipeline, staff override/reassign) —
 * read surfaces then trust the stored key. Never throws; a config-read failure
 * degrades to the static default.
 */
export async function resolveTeamKeyForCategory(
  cityId: string | null | undefined,
  // Widened to string: a custom issue type (issue #6) carries a slug outside
  // the ReportCategory union, and the column is plain text.
  category: string,
): Promise<string> {
  if (cityId) {
    try {
      const config = await fetchCityTeams(cityId);
      const owner = resolveCategoryTeam(config, category as ReportCategory);
      if (owner && owner.teamKey in TEAMS) return owner.teamKey as TeamId;
    } catch {
      // fall through
    }
    // Custom issue type (not a built-in): its owning team lives on the
    // issue_types row (migration 027), not the city_teams category config.
    // Best-effort — null when unavailable, so we still land on a sane default.
    if (!isBuiltinCategory(category)) {
      const customTeam = await fetchIssueTypeTeam(cityId, category);
      if (customTeam) return customTeam;
    }
  }
  // Built-in default. An unknown custom category with no configured team falls
  // here too — categoryToTeamDefault returns the general_admin catch-all.
  return categoryToTeamDefault(category as ReportCategory) ?? "general_admin";
}

/**
 * Build a category → owning-team display map for the staff console.
 * Prefers the city's onboarded config; falls back to the global preset default
 * so every city (including ones never onboarded via the wizard) shows a team.
 * Color comes from the preset catalog; label honors any per-city rename.
 */
export function buildCategoryTeamDisplay(
  config: CityTeamConfig[],
): CategoryTeamMap {
  const map: CategoryTeamMap = {};
  for (const category of ALL_CATEGORIES) {
    const owner = config.find((t) => t.categories.includes(category));
    if (owner) {
      map[category] = {
        teamKey: owner.teamKey,
        label: owner.label,
        color: TEAMS[owner.teamKey as TeamId]?.color ?? "#787783",
      };
      continue;
    }
    const teamKey = categoryToTeamDefault(category);
    const meta = TEAMS[teamKey];
    map[category] = { teamKey, label: meta.shortLabel, color: meta.color };
  }
  return map;
}
