import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { createLogger } from "@/lib/logger";

/* ==================================================================
   No-generic-closures (NEXT_100 #5).

   When staff close a work order they must attach a short internal reason.
   This turns that terse reason + the report context into a warm, plain-language
   explanation the resident actually reads in the resolution notice, killing the
   industry-wide "no evidence observed" generic-closure complaint.

   Graceful by contract: if the model is unavailable, rate-limited, or slow, we
   fall back to the staff-written reason verbatim (already non-generic, since a
   human wrote it). Closing a work order must NEVER fail because the AI leg did.
   ================================================================== */

const logger = createLogger("[draft-closure]");

/** Bound the drafting call tighter than classification, it's on the close path. */
const DRAFT_TIMEOUT_MS = Math.min(AI_TIMEOUT_MS, 12000);

export interface ClosureContext {
  /** Human category label, e.g. "Pothole" or "Broken streetlight". */
  category: string;
  /** Short staff-entered reason for the closure (required upstream). */
  reason: string;
  /** Optional street/address for a concrete, grounded sentence. */
  address?: string | null;
}

function buildPrompt(ctx: ClosureContext): string {
  const where = ctx.address?.trim() ? ` at ${ctx.address.trim()}` : "";
  return [
    "You write the closing message a city sends a resident when their reported",
    "issue is fixed. Rewrite the crew's internal note into 1-2 warm, plain,",
    "specific sentences a resident understands. No jargon, no bureaucratic",
    "filler, no salutation or sign-off, no markdown. State what was done.",
    "",
    `Issue category: ${ctx.category}${where}`,
    `Crew's internal note: ${ctx.reason}`,
    "",
    "Resident-facing closing message:",
  ].join("\n");
}

/**
 * Draft a resident-facing closure explanation. Returns the AI text on success,
 * or the raw staff `reason` on any failure/empty response. Never throws.
 */
export async function draftClosureExplanation(
  ctx: ClosureContext,
): Promise<string> {
  const reason = ctx.reason.trim();
  const key = process.env.GEMINI_API_KEY;
  if (!key || !reason) return reason;

  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: GEMINI_MODEL,
    });
    const result = await withRetry(
      (signal) =>
        model.generateContent(buildPrompt(ctx), {
          signal,
          timeout: DRAFT_TIMEOUT_MS,
        }),
      { timeoutMs: DRAFT_TIMEOUT_MS },
    );
    // Gemini occasionally wraps text in fences/quotes despite the prompt.
    const text = (result.response?.text?.() ?? "")
      .trim()
      .replace(/^```[a-z]*\n?|\n?```$/g, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    return text || reason;
  } catch (err) {
    logger.warn("closure_draft_failed_fallback_to_reason", {
      detail: err instanceof Error ? err.message : String(err),
    });
    return reason;
  }
}
