import "server-only";

import type { CorrectionExample } from "@/lib/ai/prompt";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("classification-feedback");

/**
 * OUTFLANK #7 — fetch a city's most common staff correction pairs from
 * classification_feedback (migration 038 RPC). Feeds the per-city few-shot block
 * appended to the classification prompt. Returns [] on any error so the classify
 * pipeline degrades to the base prompt — the feedback loop is best-effort, never
 * a blocker on getting a report classified.
 */
export async function fetchCorrectionExamples(
  cityId: string,
  limit = 5,
): Promise<CorrectionExample[]> {
  if (!cityId) return [];
  try {
    const db = createServerClient();
    const { data, error } = await db.rpc("classification_correction_examples", {
      _city_id: cityId,
      _limit: limit,
    });
    if (error) {
      logger.warn("correction-examples RPC failed", { error: error.message });
      return [];
    }
    return (data ?? []).map(
      (r: {
        original_category: string;
        corrected_category: string;
        n: number;
      }) => ({
        original_category: r.original_category,
        corrected_category: r.corrected_category,
        n: Number(r.n),
      }),
    );
  } catch (err) {
    logger.warn("correction-examples threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
