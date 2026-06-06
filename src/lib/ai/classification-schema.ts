import { type ObjectSchema, SchemaType } from "@google/generative-ai";
import { z } from "zod/v4";

const CATEGORIES = [
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

export const classificationSchema = z.object({
  category: z.enum(CATEGORIES),
  subcategory: z.string().min(1),
  severity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  hazard_radius_m: z.number().min(0),
  visible_size_estimate: z.string().min(1),
  is_emergency: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

/**
 * Gemini structured-output schema mirroring `classificationSchema`. Passed as
 * `generationConfig.responseSchema` so the model returns clean JSON matching
 * the shape we then re-validate with zod. `enum` is spread to a mutable string
 * array because the SDK's `Schema.enum` type is `string[]` (CATEGORIES is a
 * readonly tuple). severity is INTEGER (1-5); the zod schema enforces the range.
 */
export const GEMINI_CLASSIFICATION_SCHEMA: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    category: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...CATEGORIES],
    },
    subcategory: { type: SchemaType.STRING },
    severity: { type: SchemaType.INTEGER },
    hazard_radius_m: { type: SchemaType.NUMBER },
    visible_size_estimate: { type: SchemaType.STRING },
    is_emergency: { type: SchemaType.BOOLEAN },
    confidence: { type: SchemaType.NUMBER },
    reasoning: { type: SchemaType.STRING },
  },
  required: [
    "category",
    "subcategory",
    "severity",
    "hazard_radius_m",
    "visible_size_estimate",
    "is_emergency",
    "confidence",
    "reasoning",
  ],
};
