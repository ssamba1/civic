/**
 * Human-in-loop fine-tune corpus pipeline — OUTFLANK #26
 *
 * Pure transforms over classification_feedback rows. Produces JSONL-style
 * training examples `{input, expected}` from staff corrections where the
 * human's category differed from the model's output. All functions here are
 * pure (no I/O) so they are easy to unit-test and can run in any context.
 *
 * Actual feedback ingestion and export lives in:
 *   src/lib/db/classification-feedback.ts  (DB reads)
 *   src/app/api/ai/corpus/route.ts         (HTTP endpoint)
 */

/** Shape of a row from classification_feedback (only what we need). */
export interface FeedbackRow {
  id: string;
  report_id: string;
  original_category: string;
  corrected_category: string;
  /** Confidence the model had when it made the (wrong) prediction. 0-1. */
  original_confidence: number | null;
  created_at: string;
}

/** One training example in JSONL-style format. */
export interface CorpusExample {
  /** Opaque input descriptor (report ID + model's wrong prediction). */
  input: string;
  /** The human-verified correct label. */
  expected: string;
  /** Model confidence at prediction time (informational, for filtering). */
  confidence: number | null;
  /** ISO timestamp of the correction (for chronological ordering). */
  corrected_at: string;
}

/**
 * Build a list of training examples from feedback rows.
 *
 * Only rows where `original_category !== corrected_category` are included —
 * same-category rows are unchanged predictions and carry no training signal.
 *
 * Pure function — safe to call without a DB connection.
 */
export function buildCorpus(feedbackRows: FeedbackRow[]): CorpusExample[] {
  const examples: CorpusExample[] = [];
  for (const row of feedbackRows) {
    if (row.original_category === row.corrected_category) continue;
    examples.push({
      input: `report:${row.report_id} model_predicted:${row.original_category}`,
      expected: row.corrected_category,
      confidence: row.original_confidence,
      corrected_at: row.created_at,
    });
  }
  return examples;
}

/**
 * Deduplicate corpus examples.
 *
 * Two examples are considered duplicates when they share the same report_id
 * and expected label. On collision, the LATER correction wins (staff may have
 * corrected multiple times; the most recent opinion is ground truth).
 *
 * Pure function.
 */
export function dedupeCorpus(examples: CorpusExample[]): CorpusExample[] {
  // Key = "report_id:expected". Scan in order; later entries overwrite earlier.
  const map = new Map<string, CorpusExample>();
  for (const ex of examples) {
    // Extract report ID from the input string produced by buildCorpus.
    const reportMatch = ex.input.match(/^report:([^\s]+)/);
    const reportId = reportMatch ? reportMatch[1] : ex.input;
    const key = `${reportId}:${ex.expected}`;
    const existing = map.get(key);
    if (!existing || ex.corrected_at > existing.corrected_at) {
      map.set(key, ex);
    }
  }
  return Array.from(map.values());
}

/** Summary statistics over a corpus. */
export interface CorpusStats {
  total: number;
  uniqueCategories: number;
  /** Breakdown: { [category]: count } */
  byCorrectedCategory: Record<string, number>;
  /** Average model confidence at prediction time (null entries excluded). */
  avgConfidence: number | null;
}

/**
 * Compute summary statistics over a built corpus.
 *
 * Pure function.
 */
export function corpusStats(examples: CorpusExample[]): CorpusStats {
  if (examples.length === 0) {
    return {
      total: 0,
      uniqueCategories: 0,
      byCorrectedCategory: {},
      avgConfidence: null,
    };
  }

  const byCorrectedCategory: Record<string, number> = {};
  const confidences: number[] = [];

  for (const ex of examples) {
    byCorrectedCategory[ex.expected] = (byCorrectedCategory[ex.expected] ?? 0) + 1;
    if (ex.confidence !== null) confidences.push(ex.confidence);
  }

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  return {
    total: examples.length,
    uniqueCategories: Object.keys(byCorrectedCategory).length,
    byCorrectedCategory,
    avgConfidence,
  };
}
