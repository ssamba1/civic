import "server-only";

import { createLogger } from "@/lib/logger";

const logger = createLogger("benchmarks");

export interface PeerBenchmarkRow {
  cityId: string;
  cityName: string;
  state: string;
  totalReports: number;
  avgResolutionHours: number;
  closeRate: number;
  reportsPerCapita: number | null;
}

export interface RankedBenchmarkRow extends PeerBenchmarkRow {
  rank: number;
}

/**
 * Pure helper: rank rows by the given metric (ascending for hours, descending
 * for rates/counts). Ties share the same rank (dense rank).
 * Exported for unit tests.
 */
export function rankCities(
  rows: PeerBenchmarkRow[],
  metric: keyof Pick<
    PeerBenchmarkRow,
    "avgResolutionHours" | "closeRate" | "totalReports" | "reportsPerCapita"
  >,
): RankedBenchmarkRow[] {
  if (rows.length === 0) return [];

  // Lower is better for resolution hours; higher is better for everything else.
  const ascending = metric === "avgResolutionHours";
  const sorted = [...rows].sort((a, b) => {
    const av = a[metric] ?? 0;
    const bv = b[metric] ?? 0;
    return ascending ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  let rank = 1;
  const ranked: RankedBenchmarkRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1][metric] ?? 0;
      const cur = sorted[i][metric] ?? 0;
      if (cur !== prev) rank = i + 1;
    }
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

export async function getPeerBenchmarks(): Promise<PeerBenchmarkRow[]> {
  try {
    const { createServerClient } = await import("@/lib/db/client");
    const db = createServerClient();
    const { data, error } = await db.rpc("peer_city_benchmarks");
    if (error) {
      logger.warn("peer_city_benchmarks RPC failed", {
        error: error.message,
      });
      return [];
    }
    return (data ?? []).map(
      (r: {
        city_id: string;
        city_name: string;
        state: string;
        total_reports: number;
        avg_resolution_hours: number;
        close_rate: number;
        reports_per_capita: number | null;
      }) => ({
        cityId: r.city_id,
        cityName: r.city_name,
        state: r.state,
        totalReports: Number(r.total_reports),
        avgResolutionHours: Number(r.avg_resolution_hours),
        closeRate: Number(r.close_rate),
        reportsPerCapita:
          r.reports_per_capita != null ? Number(r.reports_per_capita) : null,
      }),
    );
  } catch (err) {
    logger.warn("getPeerBenchmarks threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
