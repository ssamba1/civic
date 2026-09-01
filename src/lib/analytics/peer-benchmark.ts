import "server-only";

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

/* ==================================================================
   Peer-city benchmark (NEXT_100 #40).

   Thin wrapper over the analytics_peer_benchmark RPC (migration 041). Returns
   the city's resolution rate / MTTR, its rank + percentile among active cities
   with data, and the peer medians, all anonymized aggregates. Null when the
   city has no reports or the RPC isn't present (un-migrated), so the card hides.
   ================================================================== */

const logger = createLogger("[peer-benchmark]");

export interface PeerBenchmark {
  resolution_rate: number | null;
  mttr_hours: number | null;
  rank: number;
  total_cities: number;
  percentile: number;
  peer_median_resolution: number | null;
  peer_median_mttr: number | null;
}

export async function getPeerBenchmark(
  cityId: string,
): Promise<PeerBenchmark | null> {
  const db = createServerClient();
  const { data, error } = await db.rpc("analytics_peer_benchmark", {
    _city_id: cityId,
  });
  if (error) {
    logger.warn("peer_benchmark_rpc_failed", { detail: error.message });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  // Only meaningful with at least one peer to compare against.
  if ((row.total_cities ?? 0) < 2) return null;
  return {
    resolution_rate:
      row.resolution_rate != null ? Number(row.resolution_rate) : null,
    mttr_hours: row.mttr_hours != null ? Number(row.mttr_hours) : null,
    rank: Number(row.rank),
    total_cities: Number(row.total_cities),
    percentile: Number(row.percentile),
    peer_median_resolution:
      row.peer_median_resolution != null
        ? Number(row.peer_median_resolution)
        : null,
    peer_median_mttr:
      row.peer_median_mttr != null ? Number(row.peer_median_mttr) : null,
  };
}
