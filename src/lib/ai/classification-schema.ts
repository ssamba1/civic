import { type ObjectSchema, SchemaType } from "@google/generative-ai";
import { z } from "zod/v4";
import { BUILTIN_CATEGORY_KEYS } from "./categories";

const CATEGORIES = BUILTIN_CATEGORY_KEYS;

/**
 * Build the zod validation schema for a given category set. Custom categories
 * (a city's issue_types, migration 027) are folded in at request time so a
 * runtime-added type validates end-to-end (issue #6). `z.enum` needs at least
 * one value; callers always pass the built-ins ∪ customs.
 */
export function buildClassificationSchema(categories: readonly string[]) {
  const cats = categories.length > 0 ? categories : CATEGORIES;
  const categoryEnum = z.enum(cats as [string, ...string[]]);
  return z.object({
    category: categoryEnum,
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
    // true only when the photo shows no actual infrastructure damage/hazard at
    // all — routes the report to manual staff review instead of auto-dispatch.
    no_issue_detected: z.boolean(),
    // 0-2 other categories that could also plausibly apply. A non-empty list
    // means the model itself is unsure which team should own the work order —
    // also routed to manual review.
    alternate_categories: z.array(categoryEnum).max(2),
  });
}

/**
 * Built-in schema — the 12-category default (tests + non-city-scoped callers).
 * Defined with the literal tuple (not buildClassificationSchema's `string[]`)
 * so `classificationSchema.shape.category` keeps its ReportCategory literal
 * union — consumers like ReportCategorySchema depend on that narrowing.
 */
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

export const classificationSchema = z.object({
  category: z.enum(BUILTIN_CATEGORY_TUPLE),
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
  no_issue_detected: z.boolean(),
  alternate_categories: z.array(z.enum(BUILTIN_CATEGORY_TUPLE)).max(2),
});

/**
 * Gemini structured-output schema mirroring `classificationSchema`. Passed as
 * `generationConfig.responseSchema` so the model returns clean JSON matching
 * the shape we then re-validate with zod. `enum` is spread to a mutable string
 * array because the SDK's `Schema.enum` type is `string[]` (CATEGORIES is a
 * readonly tuple). severity is INTEGER (1-5); the zod schema enforces the range.
 */
/** Build the Gemini structured-output schema for a given category set, so the
 *  model can emit a custom category. `enum` is a mutable string[] (SDK type). */
export function buildGeminiClassificationSchema(
  categories: readonly string[],
): ObjectSchema {
  const cats = [...(categories.length > 0 ? categories : CATEGORIES)];
  return {
    type: SchemaType.OBJECT,
    properties: {
      category: {
        type: SchemaType.STRING,
        format: "enum",
        enum: cats,
      },
      subcategory: { type: SchemaType.STRING },
      severity: { type: SchemaType.INTEGER },
      hazard_radius_m: { type: SchemaType.NUMBER },
      visible_size_estimate: { type: SchemaType.STRING },
      is_emergency: { type: SchemaType.BOOLEAN },
      confidence: { type: SchemaType.NUMBER },
      reasoning: { type: SchemaType.STRING },
      no_issue_detected: { type: SchemaType.BOOLEAN },
      alternate_categories: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.STRING,
          format: "enum",
          enum: cats,
        },
      },
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
      "no_issue_detected",
      "alternate_categories",
    ],
  };
}

/** Built-in Gemini schema — the 12-category default. */
export const GEMINI_CLASSIFICATION_SCHEMA: ObjectSchema =
  buildGeminiClassificationSchema(CATEGORIES);
