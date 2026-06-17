import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { ReportCategory } from "@/lib/types";
import { BASELINE_LOOKBACK_DAYS } from "./storm-config";

const logger = createLogger("[storm-baseline]");

/**
 * Average reports-per-day for each category over the trailing
 * BASELINE_LOOKBACK_DAYS, computed from this city's own classification
 * history. Fails soft: returns an empty map on any DB error so the storm
 * advisory can still render (without numeric predictions).
 */
export async function getCategoryDailyBaseline(): Promise<Partial<Record<ReportCategory, number>>> {
  const db = createServerClient();
  const since = new Date(Date.now() - BASELINE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("classifications")
    .select("category")
    .gte("created_at", since);

  if (error) {
    logger.warn("baseline_query_failed", { error: error.message });
    return {};
  }

  const counts: Partial<Record<ReportCategory, number>> = {};
  for (const row of data ?? []) {
    const cat = row.category as ReportCategory;
    counts[cat] = (counts[cat] ?? 0) + 1;
  }

  const avg: Partial<Record<ReportCategory, number>> = {};
  for (const [cat, count] of Object.entries(counts)) {
    avg[cat as ReportCategory] = count / BASELINE_LOOKBACK_DAYS;
  }
  return avg;
}
