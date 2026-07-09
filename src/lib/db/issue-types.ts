import "server-only";
import type { CategoryDef } from "@/lib/ai/categories";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-issue-types");

/** One issue_types row (migration 027 + 036 description). */
export interface IssueTypeRow {
  key: string;
  label: string;
  description: string | null;
  teamKey: string;
}

/**
 * A city's dispatcher-defined custom issue types (issue_types, migration 027),
 * shaped as AI category defs so the classify pipeline can offer them to the
 * model. Best-effort by design: any error — including a pre-027 DB where the
 * table is missing, or a pre-036 DB with no `description` column — returns [],
 * so classification falls back to the 12 built-ins and never breaks.
 *
 * A custom type with no description is skipped for CLASSIFICATION only (the model
 * has nothing to match on), but still routes when picked manually — routing
 * reads team_key via fetchIssueTypeTeam, independent of this.
 */
export async function fetchCustomCategoryDefs(
  cityId: string,
): Promise<CategoryDef[]> {
  const rows = await fetchCityIssueTypes(cityId);
  return rows
    .filter((r) => r.description && r.description.trim() !== "")
    .map((r) => ({ key: r.key, description: (r.description as string).trim() }));
}

/** Raw issue_types rows for a city (active set); [] on any failure. */
export async function fetchCityIssueTypes(
  cityId: string,
): Promise<IssueTypeRow[]> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("issue_types")
      .select("key, label, description, team_key")
      .eq("city_id", cityId);
    if (error) {
      // Missing table/column on a pre-027/036 DB is the expected degrade path.
      if (error.code === "PGRST205" || error.code === "42703") {
        log.warn("issue_types unavailable — using built-in categories only", {
          cityId,
        });
      } else {
        log.error("issue_types query failed", error, { cityId });
      }
      return [];
    }
    return (
      (data ?? []) as {
        key: string;
        label: string;
        description: string | null;
        team_key: string;
      }[]
    ).map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      teamKey: r.team_key,
    }));
  } catch (err) {
    log.error("fetchCityIssueTypes threw", err, { cityId });
    return [];
  }
}

/**
 * The team_key a custom issue type routes to, or null when the city has no such
 * type (or the table is unavailable). Used by write-time routing so a custom
 * category reaches its configured team. Never throws.
 */
export async function fetchIssueTypeTeam(
  cityId: string,
  key: string,
): Promise<string | null> {
  const rows = await fetchCityIssueTypes(cityId);
  return rows.find((r) => r.key === key)?.teamKey ?? null;
}
