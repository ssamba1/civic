import "server-only";
import type { CityCrewType } from "@/lib/crew-types";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db-crew-types");

/**
 * All custom crew types of `cityId`, name-ordered. Best-effort: any failure
 * (including an un-migrated DB missing the 031 table) logs and returns [] —
 * callers then behave exactly as before custom types existed.
 */
export async function fetchCityCrewTypes(
  cityId: string,
): Promise<CityCrewType[]> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("city_crew_types")
      .select("name, description")
      .eq("city_id", cityId)
      .order("name");
    if (error) {
      log.warn("city_crew_types query failed (degrading to none)", {
        cityId,
        error: error.message,
      });
      return [];
    }
    return (data ?? []) as CityCrewType[];
  } catch (err) {
    log.error("fetchCityCrewTypes threw", err, { cityId });
    return [];
  }
}
