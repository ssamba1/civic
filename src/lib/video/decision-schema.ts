/**
 * Structured-output contract for the stage-2 decision run, the "actual LLM"
 * that fires only when the LLM-free detector has already found something.
 * Mirrors the classification-schema pattern: one zod schema for validation,
 * one Gemini responseSchema for structured output, kept field-identical.
 */
import { type ObjectSchema, SchemaType } from "@google/generative-ai";
import { z } from "zod/v4";

export const DECISION_VALUES = [
  "dispatch",
  "monitor",
  "dismiss",
  "merge",
] as const;
export type DecisionValue = (typeof DECISION_VALUES)[number];

export const COST_BANDS = [
  "under_500",
  "500_2500",
  "2500_10000",
  "over_10000",
] as const;

/** Where a citation points inside the supplied context. */
export const CITATION_SOURCES = [
  "detection_evidence",
  "nearby_report",
  "sla_target",
  "crew_catalog",
  "correction_history",
] as const;

const BUILTIN_CATEGORY_TUPLE = [
  "pothole",
  "streetlight",
  "downed_sign",
  "graffiti",
  "illegal_dump",
  "water_leak",
  "sidewalk_damage",
  "tree_down",
  "debris",
  "drainage",
  "faded_signage",
  "other",
] as const;

export const decisionSchema = z.object({
  decision: z.enum(DECISION_VALUES),
  category: z.enum(BUILTIN_CATEGORY_TUPLE),
  severity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  // Required non-null when decision === "merge"; must be one of the nearby
  // report ids offered in context. Enforced post-parse in decide.ts (zod
  // can't see the offered list here).
  merge_report_id: z.string().nullable(),
  cost_band: z.enum(COST_BANDS),
  citations: z
    .array(
      z.object({
        source: z.enum(CITATION_SOURCES),
        ref: z.string(),
        note: z.string(),
      }),
    )
    .max(10),
});

export type Decision = z.infer<typeof decisionSchema>;

/**
 * A "merge" pointing at a report id that was never offered in context is a
 * hallucination, downgrade it to "monitor" rather than touching an arbitrary
 * report. Also strips a stray merge_report_id from non-merge decisions. Pure.
 */
export function sanitizeDecision(
  decision: Decision,
  offeredReportIds: readonly string[],
): Decision {
  if (decision.decision !== "merge") {
    return { ...decision, merge_report_id: null };
  }
  if (
    decision.merge_report_id &&
    offeredReportIds.includes(decision.merge_report_id)
  ) {
    return decision;
  }
  return {
    ...decision,
    decision: "monitor",
    merge_report_id: null,
    rationale: `${decision.rationale} [system: merge target was not among offered nearby reports, downgraded to monitor]`,
  };
}

export const GEMINI_DECISION_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    decision: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...DECISION_VALUES],
    },
    category: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...BUILTIN_CATEGORY_TUPLE],
    },
    severity: { type: SchemaType.INTEGER },
    confidence: { type: SchemaType.NUMBER },
    rationale: { type: SchemaType.STRING },
    merge_report_id: { type: SchemaType.STRING, nullable: true },
    cost_band: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...COST_BANDS],
    },
    citations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          source: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...CITATION_SOURCES],
          },
          ref: { type: SchemaType.STRING },
          note: { type: SchemaType.STRING },
        },
        required: ["source", "ref", "note"],
      },
    },
  },
  required: [
    "decision",
    "category",
    "severity",
    "confidence",
    "rationale",
    "merge_report_id",
    "cost_band",
    "citations",
  ],
};
