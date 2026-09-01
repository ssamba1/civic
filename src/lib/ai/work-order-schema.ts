import { type ObjectSchema, SchemaType } from "@google/generative-ai";
import { z } from "zod/v4";
import { DEFAULT_CREW_TYPE_KEYS } from "@/lib/crew-types";

const DEPARTMENTS = [
  "public_works",
  "utilities",
  "parks",
  "code_enforcement",
  "sanitation",
  "other",
] as const;

/**
 * Guard an incoming key list: the schema builders must never produce an empty
 * enum (Gemini rejects it and zod's enum needs at least one member), so an
 * empty/absent city list falls back to the app defaults.
 */
function effectiveKeys(crewTypeKeys: readonly string[]): string[] {
  return crewTypeKeys.length > 0 ? [...crewTypeKeys] : DEFAULT_CREW_TYPE_KEYS;
}

/**
 * Zod schema for the Gemini work-order response, with crew_type constrained
 * to the given city's crew-type keys (crew_types table, migration 031).
 * crew_type is nullable (category "other" has no physical crew). materials is
 * a list of {item, qty} objects. The staff work-order panel already renders
 * that object form.
 */
export function buildAiWorkOrderSchema(crewTypeKeys: readonly string[]) {
  const keys = effectiveKeys(crewTypeKeys);
  return z.object({
    department: z.enum(DEPARTMENTS),
    crew_type: z
      .string()
      .refine((k) => keys.includes(k), "unknown_crew_type")
      .nullable(),
    // Free text on purpose (crew names aren't an enum the model must hit):
    // the pipeline only honors a hint that exactly matches a real crew, so a
    // hallucinated name degrades to the load balancer, never a bad assignment.
    // default(null): crew_hint is nullable + non-required in the Gemini schema,
    // so the model may omit the key entirely. Treat absent as "no hint".
    crew_hint: z.string().nullable().default(null),
    est_minutes: z.number().int().min(0),
    materials: z
      .array(
        z.object({
          item: z.string().min(1),
          qty: z.number().int().min(1),
        }),
      )
      .max(20),
    // Upper bound: $5M per job. Prevents a hallucinated astronomical value from
    // persisting. The pipeline applies a tighter per-category clamp on top.
    est_cost: z.number().min(0).max(5_000_000),
    rationale: z.string().min(1),
  });
}

/** Default-keys schema, used by tests and any caller without city context. */
export const aiWorkOrderSchema = buildAiWorkOrderSchema(DEFAULT_CREW_TYPE_KEYS);

export type AiWorkOrder = z.infer<typeof aiWorkOrderSchema>;

/**
 * Gemini structured-output schema mirroring `buildAiWorkOrderSchema`. Passed
 * as `generationConfig.responseSchema` so the model returns clean JSON we then
 * re-validate with zod. Built per-call because the crew_type enum is the
 * city's own catalog. crew_type is nullable + omitted from `required` so the
 * model can legitimately return null for category "other" (which has no
 * physical crew), matching the prompt and the zod `.nullable()` layer.
 */
export function buildGeminiWorkOrderSchema(
  crewTypeKeys: readonly string[],
): ObjectSchema {
  return {
    type: SchemaType.OBJECT,
    properties: {
      department: {
        type: SchemaType.STRING,
        format: "enum",
        enum: [...DEPARTMENTS],
      },
      crew_type: {
        type: SchemaType.STRING,
        format: "enum",
        enum: effectiveKeys(crewTypeKeys),
        nullable: true,
      },
      crew_hint: {
        type: SchemaType.STRING,
        nullable: true,
      },
      est_minutes: { type: SchemaType.INTEGER },
      materials: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            item: { type: SchemaType.STRING },
            qty: { type: SchemaType.INTEGER },
          },
          required: ["item", "qty"],
        },
      },
      est_cost: { type: SchemaType.NUMBER },
      rationale: { type: SchemaType.STRING },
    },
    required: [
      "department",
      "est_minutes",
      "materials",
      "est_cost",
      "rationale",
    ],
  };
}

/** Default-keys Gemini schema, kept for tests / no-city-context callers. */
export const GEMINI_WORK_ORDER_SCHEMA: ObjectSchema =
  buildGeminiWorkOrderSchema(DEFAULT_CREW_TYPE_KEYS);
