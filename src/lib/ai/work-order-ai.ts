import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { type CrewTypeDef, DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import { serverEnv } from "@/lib/env";
import type { Classification, Department, Result } from "@/lib/types";
import { buildWorkOrderPrompt, WORK_ORDER_SYSTEM_PROMPT } from "./prompt";
import { checkAndRecordGeminiCall } from "./rate-limiter";
import { estimateCost } from "./work-order-rules";
import {
  type AiWorkOrder,
  buildAiWorkOrderSchema,
  buildGeminiWorkOrderSchema,
} from "./work-order-schema";

/**
 * Shape the classify pipeline persists. Mirrors the deterministic
 * GeneratedWorkOrder minus priority_score (priority stays deterministic and
 * auditable — the AI sizes crew/materials/minutes/cost, not the dispatch
 * priority math). materials is flattened to display strings ("item ×qty") so
 * the work_orders.materials jsonb column stays a string[] like the rules path.
 */
export interface AiGeneratedWorkOrder {
  department: Department;
  /** A key from the city's crew_types catalog (or a default key), not the
   *  static CrewType union — cities define their own types (031). */
  crew_type: string | null;
  est_minutes: number;
  materials: string[];
  est_cost: number;
  rationale: string;
}

/** Flatten {item, qty} objects to "item" / "item ×qty" display strings. */
function flattenMaterials(materials: AiWorkOrder["materials"]): string[] {
  return materials.map((m) => (m.qty > 1 ? `${m.item} ×${m.qty}` : m.item));
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

/**
 * Generate a dispatch-ready work order from a classification with Gemini.
 *
 * Same resilience contract as classifyPhoto: rate-limited, per-attempt timeout
 * + retry, structured output re-validated with zod. Returns ok:false on any
 * failure so the caller can fall back to the deterministic rules generator —
 * this call must never throw the pipeline.
 */
export async function generateWorkOrderAI(
  classification: Classification,
  crewTypes: CrewTypeDef[] = DEFAULT_CREW_TYPES,
): Promise<Result<AiGeneratedWorkOrder>> {
  const rateCheck = checkAndRecordGeminiCall();
  if (!rateCheck.allowed) {
    return {
      ok: false,
      error: `Gemini rate limit: ${rateCheck.reason}. Retry in ${Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000)}s.`,
    };
  }

  // Guard here (not just in the schema builders) so the prompt menu and the
  // response enum always describe the same list.
  const effectiveTypes = crewTypes.length > 0 ? crewTypes : DEFAULT_CREW_TYPES;
  const crewTypeKeys = effectiveTypes.map((t) => t.key);

  try {
    const genAI = new GoogleGenerativeAI(serverEnv.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: WORK_ORDER_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: buildGeminiWorkOrderSchema(crewTypeKeys),
      },
    });

    // The classification is the entire context — append it as compact JSON.
    const request = `${buildWorkOrderPrompt(effectiveTypes)}

## CLASSIFICATION
${JSON.stringify(
  {
    category: classification.category,
    subcategory: classification.subcategory,
    severity: classification.severity,
    hazard_radius_m: classification.hazard_radius_m,
    visible_size_estimate: classification.visible_size_estimate,
    is_emergency: classification.is_emergency,
  },
  null,
  2,
)}`;

    const result = await withRetry(
      (signal) =>
        model.generateContent(request, { signal, timeout: AI_TIMEOUT_MS }),
      { timeoutMs: AI_TIMEOUT_MS },
    );

    const cleaned = stripCodeFences(result.response.text());

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: `Work-order AI returned invalid JSON: ${cleaned.slice(0, 300)}`,
      };
    }

    const validation = buildAiWorkOrderSchema(crewTypeKeys).safeParse(parsed);
    if (!validation.success) {
      return {
        ok: false,
        error: `Work-order validation failed: ${JSON.stringify(validation.error.issues)}`,
      };
    }

    const wo = validation.data;
    // Ceiling: cap at 50× the deterministic rules floor for this category,
    // never above $5M. Prevents a hallucinated/malformed cost from persisting
    // unchecked — a legitimate AI estimate should never exceed 50× the known
    // material+labor baseline. (Math.max here would make the ceiling AT LEAST
    // $5M and the 50× cap dead code.) The Math.max floor is applied again in
    // classify-pipeline. Guard rulesFloor <= 0 so an unknown category doesn't
    // zero the ceiling and clamp every estimate to 0.
    const rulesFloor = estimateCost(classification.category);
    const costCeiling =
      rulesFloor > 0 ? Math.min(rulesFloor * 50, 5_000_000) : 5_000_000;
    const estCost = Math.min(Math.round(wo.est_cost), costCeiling);
    return {
      ok: true,
      data: {
        department: wo.department,
        crew_type: wo.crew_type,
        est_minutes: wo.est_minutes,
        materials: flattenMaterials(wo.materials),
        est_cost: estCost,
        rationale: wo.rationale,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Work-order AI error: ${message}` };
  }
}
