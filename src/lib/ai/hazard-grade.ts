/**
 * Hazard grading from image — OUTFLANK #27
 *
 * Prompts Gemini vision to produce a severity grade and public-safety flag
 * from a photo. Called as an OPTIONAL step in classify-pipeline; never throws
 * and never blocks classification on failure.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { serverEnv } from "@/lib/env";
import type { Result } from "@/lib/types";

export type HazardSeverity = "low" | "medium" | "high" | "critical";

export interface HazardGrade {
  severity: HazardSeverity;
  rationale: string;
  publicSafetyRisk: boolean;
}

/** Strip markdown code fences (reuses same logic as gemini.ts). */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  return match ? match[1].trim() : trimmed;
}

const SEVERITY_VALUES: HazardSeverity[] = ["low", "medium", "high", "critical"];

/**
 * Map a raw (potentially freeform) severity string from the model to one of
 * the four canonical values. Case-insensitive; partial matches accepted so
 * minor prompt drift doesn't break the schema. Defaults to "medium".
 *
 * Pure function — unit-testable with no side effects.
 */
export function normalizeSeverity(raw: string): HazardSeverity {
  const lower = (raw ?? "").toLowerCase().trim();
  for (const v of SEVERITY_VALUES) {
    if (lower === v || lower.startsWith(v)) return v;
  }
  return "medium";
}

/**
 * Convert a severity grade to a work-order priority delta.
 * Low → 0, medium → 5, high → 15, critical → 30.
 *
 * Pure function — unit-testable with no side effects.
 */
export function severityToPriority(severity: HazardSeverity): number {
  switch (severity) {
    case "low":
      return 0;
    case "medium":
      return 5;
    case "high":
      return 15;
    case "critical":
      return 30;
  }
}

const HAZARD_PROMPT = `You are a public-safety expert reviewing a photo of infrastructure damage.

Grade the hazard level of what you see. Reply with JSON only — no markdown, no preamble:

{
  "severity": "<low|medium|high|critical>",
  "rationale": "<one sentence explaining the grade>",
  "publicSafetyRisk": <true|false>
}

Severity definitions:
- low: cosmetic damage, no immediate risk (faded paint, minor graffiti)
- medium: degraded infrastructure that could cause injury if untreated (small pothole, cracked sidewalk)
- high: active hazard likely to cause injury (large pothole, downed sign, significant water leak)
- critical: life-threatening hazard requiring immediate response (downed power line, collapsed road, gas leak)

publicSafetyRisk = true when there is a meaningful chance of pedestrian or vehicular injury if left unaddressed.`;

/**
 * Grade the hazard severity of a photo via Gemini vision.
 *
 * Returns ok:false (never throws) so classify-pipeline can safely ignore
 * failures. Requires GEMINI_API_KEY; returns a graceful fallback error when
 * the key is absent so the pipeline degrades cleanly in dev/CI.
 */
export async function gradeHazard(input: {
  imageBase64: string;
  mimeType: string;
}): Promise<Result<HazardGrade>> {
  const apiKey = serverEnv.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY not configured" };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await withRetry(
      (signal) =>
        model.generateContent(
          [
            HAZARD_PROMPT,
            {
              inlineData: { data: input.imageBase64, mimeType: input.mimeType },
            },
          ],
          { signal, timeout: AI_TIMEOUT_MS },
        ),
      { timeoutMs: AI_TIMEOUT_MS },
    );

    const rawText = result.response?.text?.() ?? "";
    if (!rawText.trim()) {
      return {
        ok: false,
        error: "Gemini returned empty response for hazard grade",
      };
    }

    const cleaned = stripCodeFences(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: `Hazard grade: invalid JSON from Gemini: ${cleaned.slice(0, 200)}`,
      };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return {
        ok: false,
        error: "Hazard grade: unexpected non-object from Gemini",
      };
    }

    const obj = parsed as Record<string, unknown>;
    const severity = normalizeSeverity(String(obj.severity ?? "medium"));
    const rationale =
      typeof obj.rationale === "string"
        ? obj.rationale.slice(0, 500)
        : "No rationale provided.";
    const publicSafetyRisk = Boolean(obj.publicSafetyRisk);

    return { ok: true, data: { severity, rationale, publicSafetyRisk } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Hazard grade API error: ${message}` };
  }
}
