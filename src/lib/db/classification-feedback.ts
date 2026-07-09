import "server-only";

import type { FeedbackRow } from "@/lib/ai/feedback-corpus";
import type { CorrectionExample } from "@/lib/ai/prompt";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("classification-feedback");

/**
 * Fetch all classification_feedback rows for corpus building (#26).
 * Returns rows ordered by created_at asc so dedupeCorpus keeps the latest.
 * Gracefully degrades to [] on any DB error — the corpus endpoint returns an
 * empty JSONL rather than a 500, keeping the route safe to call at any time.
 */
export async function listFeedbackForCorpus(
  limit = 10_000,
): Promise<FeedbackRow[]> {
  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("classification_feedback")
      .select(
        "id, report_id, original_category, corrected_category, original_confidence, created_at",
      )
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      logger.warn("listFeedbackForCorpus query failed", {
        error: error.message,
      });
      return [];
    }
    return (data ?? []).map((r) => ({
      id: String(r.id),
      report_id: String(r.report_id),
      original_category: String(r.original_category),
      corrected_category: String(r.corrected_category),
      original_confidence:
        r.original_confidence !== null && r.original_confidence !== undefined
          ? Number(r.original_confidence)
          : null,
      created_at: String(r.created_at),
    }));
  } catch (err) {
    logger.warn("listFeedbackForCorpus threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

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
