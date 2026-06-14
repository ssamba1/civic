import { type ObjectSchema, SchemaType } from "@google/generative-ai";
import { z } from "zod/v4";

const DEPARTMENTS = [
  "public_works",
  "utilities",
  "parks",
  "code_enforcement",
  "sanitation",
  "other",
] as const;

const CREW_TYPES = [
  "paving",
  "line_crew",
  "sign_crew",
  "cleanup",
  "concrete",
  "arborist",
  "drain_crew",
] as const;

/**
 * Shape returned by the Gemini work-order generator. crew_type is nullable
 * (category "other" has no physical crew). materials is a list of {item, qty}
 * objects — the staff work-order panel already renders that object form.
 */
export const aiWorkOrderSchema = z.object({
  department: z.enum(DEPARTMENTS),
  crew_type: z.enum(CREW_TYPES).nullable(),
  est_minutes: z.number().int().min(0),
  materials: z
    .array(
      z.object({
        item: z.string().min(1),
        qty: z.number().int().min(1),
      }),
    )
    .max(20),
  est_cost: z.number().min(0),
  rationale: z.string().min(1),
});

export type AiWorkOrder = z.infer<typeof aiWorkOrderSchema>;

/**
 * Gemini structured-output schema mirroring `aiWorkOrderSchema`. Passed as
 * `generationConfig.responseSchema` so the model returns clean JSON we then
 * re-validate with zod. The SDK has no nullable flag, so crew_type is a plain
 * enum here and the zod layer enforces the null-for-"other" case after parse.
 */
export const GEMINI_WORK_ORDER_SCHEMA: ObjectSchema = {
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
      enum: [...CREW_TYPES],
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
    "crew_type",
    "est_minutes",
    "materials",
    "est_cost",
    "rationale",
  ],
};
