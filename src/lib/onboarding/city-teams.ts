import { createServerClient } from "@/lib/db/client";
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
export async function fetchCityTeams(cityId: string): Promise<CityTeamConfig[]> {
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
