import "server-only";

import { fetchDistrictRollups } from "@/lib/db/districts";
import type { DistrictRollup } from "@/lib/db/districts";
import { createLogger } from "@/lib/logger";

const logger = createLogger("equity");

export interface EquityRow {
  districtId: string;
  name: string;
  repName: string | null;
  reportCount: number;
  avgResolutionHours: number;
  openRate: number;
  underserved: boolean;
}

export interface EquityData {
  rows: EquityRow[];
  citywideMedian: number;
  threshold: number;
}

/**
 * Pure helper: flag districts whose avg resolution is >1.5x the citywide median.
 * Exported for unit tests.
 */
export function computeEquity(
  rows: DistrictRollup[],
  citywideMedian: number,
): EquityRow[] {
  const threshold = citywideMedian * 1.5;
  return rows.map((r) => ({
    districtId: r.districtId,
    name: r.name,
    repName: r.repName,
    reportCount: r.total,
    avgResolutionHours: r.avgResolutionHours,
    openRate: r.total === 0 ? 0 : r.openCount / r.total,
    underserved: citywideMedian > 0 && r.avgResolutionHours > threshold,
  }));
}

/**
 * Compute the median of a numeric array. Returns 0 for empty input.
 * Exported for unit tests.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function fetchEquityData(cityId: string): Promise<EquityData> {
  try {
    const rollups = await fetchDistrictRollups(cityId);
    if (rollups.length === 0) {
      return { rows: [], citywideMedian: 0, threshold: 0 };
    }
    const citywideMedian = median(rollups.map((r) => r.avgResolutionHours));
    const rows = computeEquity(rollups, citywideMedian);
    // Sort underserved first, then by avg resolution descending
    rows.sort((a, b) => {
      if (a.underserved !== b.underserved) return a.underserved ? -1 : 1;
      return b.avgResolutionHours - a.avgResolutionHours;
    });
    return { rows, citywideMedian, threshold: citywideMedian * 1.5 };
  } catch (err) {
    logger.warn("fetchEquityData threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], citywideMedian: 0, threshold: 0 };
  }
}
