import type { ResponseSchema } from "@google/generative-ai";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { z } from "zod/v4";
import { AI_TIMEOUT_MS, GEMINI_MODEL } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { serverEnv } from "@/lib/env";

/**
 * Reasoning AI module.
 *
 * Produces a municipal cost breakdown + severity scoring rationale for a single
 * report, grounded in its metadata. Mirrors the response shape consumed by
 * /api/ai/reasoning ({ reasoning, costBreakdown, scoringExplanation }) without
 * importing from the route — the Section type is declared locally to avoid a
 * circular import.
 */

type Section = { title: string; value: string };

export interface ReasoningPayload {
  reasoning: string;
  costBreakdown: Section[];
  scoringExplanation: Section[];
}

export interface ReasoningInput {
  id: string;
  category: string;
  severity: number;
  status: string;
  address: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Gemini structured-output call
// ---------------------------------------------------------------------------

/**
 * Response schema for the structured Gemini call. `@google/generative-ai`
 * (v0.24.1) enforces this when responseMimeType is "application/json".
 */
const REASONING_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    reasoning: {
      type: SchemaType.STRING,
      description:
        "One concise paragraph summarizing why this report scored its severity and the broad cost drivers.",
    },
    costBreakdown: {
      type: SchemaType.ARRAY,
      description:
        "Line items of a realistic municipal cost estimate (labor, equipment, coordination, logistics, impact).",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          value: { type: SchemaType.STRING },
        },
        required: ["title", "value"],
      },
    },
    scoringExplanation: {
      type: SchemaType.ARRAY,
      description:
        "Line items explaining the severity score: classification, public impact, SLA, response strategy, escalation.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          value: { type: SchemaType.STRING },
        },
        required: ["title", "value"],
      },
    },
  },
  required: ["reasoning", "costBreakdown", "scoringExplanation"],
};

function buildPrompt(
  input: ReasoningInput,
  slaHours: number,
  categoryLabel: string,
): string {
  const ageDays = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(input.created_at).getTime()) / 86_400_000,
    ),
  );

  return [
    "You are a senior municipal operations analyst for a U.S. city public-works department.",
    "Given a single citizen-submitted infrastructure report, produce (a) a realistic cost",
    "breakdown a city would use to budget the repair, and (b) a rationale for the assigned",
    "severity score. Use concrete, plausible dollar figures and reference real municipal",
    "workflows (crew dispatch, contractor procurement, incident management, SLAs). Keep each",
    "section value to 1-2 sentences. Scale tone and cost to the severity and category.",
    "",
    "REPORT",
    `- Category: ${categoryLabel} (${input.category})`,
    `- Severity: ${input.severity}/5`,
    `- Status: ${input.status}`,
    `- Address: ${input.address}`,
    `- Reported: ${input.created_at} (~${ageDays} day(s) ago)`,
    `- SLA target: ${slaHours} hour(s) to resolution`,
    "",
    "Return:",
    "- reasoning: one paragraph tying severity to the dominant cost drivers.",
    "- costBreakdown: 4-6 sections (e.g. Base Estimate, Crew & Labor, Equipment & Materials,",
    "  Coordination Overhead, Timeline & Logistics, Total Impact) with title + value.",
    "- scoringExplanation: 4-6 sections (e.g. Classification, Public Impact, SLA Target,",
    "  Response Strategy, Escalation Trigger) with title + value.",
  ].join("\n");
}

const SectionSchema = z.object({
  title: z.string(),
  value: z.string(),
});

const ReasoningPayloadSchema = z.object({
  reasoning: z.string().min(1),
  costBreakdown: z.array(SectionSchema).min(1),
  scoringExplanation: z.array(SectionSchema).min(1),
});

/**
 * Text-only Gemini call returning a structured municipal cost + scoring payload.
 * Wrapped in withRetry with a per-attempt AI_TIMEOUT_MS abort. Throws on
 * transport failure or malformed output so callers can fall back gracefully.
 */
export async function geminiReasoning(
  input: ReasoningInput,
  slaHours: number,
  categoryLabel: string,
): Promise<ReasoningPayload> {
  const genAI = new GoogleGenerativeAI(serverEnv.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: REASONING_SCHEMA,
    },
  });

  const prompt = buildPrompt(input, slaHours, categoryLabel);

  return withRetry(
    async (signal) => {
      const result = await model.generateContent(prompt, { signal });
      const text = result.response.text();
      const parsed = ReasoningPayloadSchema.parse(JSON.parse(text));
      return parsed;
    },
    { timeoutMs: AI_TIMEOUT_MS },
  );
}

// ---------------------------------------------------------------------------
// Cache + orchestration
// ---------------------------------------------------------------------------

const CACHE_MAX = 500;
/** Module-level LRU-ish cache keyed by report id. Insertion order = age. */
const cache = new Map<string, ReasoningPayload>();

function cacheGet(id: string): ReasoningPayload | undefined {
  const hit = cache.get(id);
  if (hit === undefined) return undefined;
  // Refresh recency: move to newest position.
  cache.delete(id);
  cache.set(id, hit);
  return hit;
}

function cacheSet(id: string, payload: ReasoningPayload): void {
  cache.delete(id);
  cache.set(id, payload);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Resolve a reasoning payload with three-tier sourcing for observability:
 *   cache    — previously computed gemini result for this id
 *   gemini   — freshly generated and cached
 *   template — deterministic fallback used on any gemini error
 *
 * Only successful gemini results are cached; template fallbacks are not, so a
 * transient failure does not poison the cache for the report's id.
 */
export async function getReasoning(
  input: ReasoningInput,
  slaHours: number,
  categoryLabel: string,
  templateFallback: () => ReasoningPayload,
): Promise<{
  payload: ReasoningPayload;
  source: "cache" | "gemini" | "template";
}> {
  const cached = cacheGet(input.id);
  if (cached !== undefined) {
    return { payload: cached, source: "cache" };
  }

  try {
    const payload = await geminiReasoning(input, slaHours, categoryLabel);
    cacheSet(input.id, payload);
    return { payload, source: "gemini" };
  } catch {
    return { payload: templateFallback(), source: "template" };
  }
}
