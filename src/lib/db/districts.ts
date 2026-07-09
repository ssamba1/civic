import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("districts");

export interface DistrictRollup {
  districtId: string;
  name: string;
  repName: string | null;
  total: number;
  openCount: number;
  closed: number;
  avgResolutionHours: number;
}

/**
 * OUTFLANK #16 — per-council-district report rollups (migration 041 RPC,
 * point-in-polygon). Returns [] on error or for a city with no districts
 * seeded, so the turf-report UI degrades to an empty state.
 */
export async function fetchDistrictRollups(
  cityId: string,
): Promise<DistrictRollup[]> {
  if (!cityId) return [];
  try {
    const db = createServerClient();
    const { data, error } = await db.rpc("district_rollups", {
      _city_id: cityId,
    });
    if (error) {
      logger.warn("district_rollups RPC failed", { error: error.message });
      return [];
    }
    return (data ?? []).map(
      (r: {
        district_id: string;
        name: string;
        rep_name: string | null;
        total: number;
        open_count: number;
        closed: number;
        avg_resolution_hours: number;
      }) => ({
        districtId: r.district_id,
        name: r.name,
        repName: r.rep_name,
        total: Number(r.total),
        openCount: Number(r.open_count),
        closed: Number(r.closed),
        avgResolutionHours: Number(r.avg_resolution_hours),
      }),
    );
  } catch (err) {
    logger.warn("district_rollups threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
