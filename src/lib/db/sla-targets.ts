import "server-only";

import { CATEGORY_SLA_TARGETS } from "@/lib/dashboard-data";
import type { createServerClient } from "@/lib/db/client";
import type { ReportCategory } from "@/lib/types";

type ServiceClient = ReturnType<typeof createServerClient>;

/**
 * Resolve the SLA window (hours to resolution) for a city + category.
 *
 * Prefers the city's own `sla_targets` row (migration 024); falls back to the
 * static CATEGORY_SLA_TARGETS map when the table is un-migrated, the city has
 * not seeded targets, or the lookup errors. Mirrors the graceful-degrade
 * pattern used for city_teams / crew_types. A missing DB row is never a hard
 * failure, just a fall-through to the shipped defaults.
 */
export async function fetchSlaHours(
  supabase: ServiceClient,
  cityId: string | null | undefined,
  category: ReportCategory,
): Promise<number> {
  const fallback = CATEGORY_SLA_TARGETS[category] ?? CATEGORY_SLA_TARGETS.other;
  if (!cityId) return fallback;
  try {
    const { data, error } = await supabase
      .from("sla_targets")
      .select("hours")
      .eq("city_id", cityId)
      .eq("category", category)
      .maybeSingle<{ hours: number }>();
    if (error || !data || typeof data.hours !== "number" || data.hours <= 0) {
      return fallback;
    }
    return data.hours;
  } catch {
    return fallback;
  }
}
