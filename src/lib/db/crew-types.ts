import "server-only";
import { type CrewTypeDef, DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-crew-types");

/** One crew_types row (migration 031). */
export interface CrewTypeRow {
  id: string;
  key: string;
  label: string;
  description: string;
  active: boolean;
}

export type CityCrewTypesResult =
  | { ok: true; types: CrewTypeRow[] }
  | { ok: false; error: string };

/**
 * All crew_types rows for a city (active and inactive), the admin management
 * view. Service-role client; call only behind a staff-access gate. Never
 * throws. An error (including a missing table on a pre-031 DB) returns a
 * tagged failure so the caller can fall back to DEFAULT_CREW_TYPES.
 */
export async function fetchCityCrewTypes(
  cityId: string,
): Promise<CityCrewTypesResult> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("crew_types")
      .select("id, key, label, description, active")
      .eq("city_id", cityId)
      .order("label");
    if (error) {
      // PGRST205 = table not in the schema cache. The expected pre-031
      // state, and every caller has a defaults fallback. Warn, don't error:
      // an error here makes the designed degrade path look like an outage.
      if (error.code === "PGRST205") {
        log.warn(
          "crew_types table missing (migration 031 pending), using built-in defaults",
          {
            cityId,
          },
        );
      } else {
        log.error("crew_types query failed", error, { cityId });
      }
      return { ok: false, error: "crew_types_query_failed" };
    }
    return { ok: true, types: (data ?? []) as CrewTypeRow[] };
  } catch (err) {
    log.error("fetchCityCrewTypes threw", err, { cityId });
    return { ok: false, error: "crew_types_query_failed" };
  }
}

/**
 * The city's ACTIVE crew types as plain defs. What the work-order AI prompt
 * and the crew-type selects consume. Degrades to DEFAULT_CREW_TYPES when the
 * city has no rows or the table is missing/unreadable, so every caller always
 * gets a non-empty list.
 */
export async function fetchActiveCrewTypeDefs(
  cityId: string,
): Promise<CrewTypeDef[]> {
  const result = await fetchCityCrewTypes(cityId);
  if (!result.ok) return DEFAULT_CREW_TYPES;
  const active = result.types.filter((t) => t.active);
  if (active.length === 0) return DEFAULT_CREW_TYPES;
  return active.map(({ key, label, description }) => ({
    key,
    label,
    description,
  }));
}
