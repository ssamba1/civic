import { z } from "zod/v4";
import { isValidTeamId } from "@/lib/teams";

/**
 * Zod schemas for JSON validation across localStorage and API boundaries.
 * Consolidates validation logic for: custom categories, overrides, ratings, completions, upvotes.
 * Used by: custom-categories.ts, category-overrides.ts, teams-overrides.ts,
 * resident-csat.ts, task-completion.ts, upvotes.ts
 */

// ============================================================================
// Storage: Custom Categories (custom-categories.ts)
// ============================================================================

export const CustomCategorySchema = z.object({
  id: z.string().regex(/^custom_/, "id must start with 'custom_'"),
  label: z.string().min(1, "label is required"),
  color: z.string(),
  team: z
    .string()
    .refine((t) => isValidTeamId(t) && t !== "all", "invalid team"),
});

export type CustomCategory = z.infer<typeof CustomCategorySchema>;

export function validateCustomCategories(data: unknown): CustomCategory[] {
  const schema = z.array(CustomCategorySchema);
  const result = schema.safeParse(data);
  return result.success ? result.data : [];
}

// ============================================================================
// Storage: Category Routing Overrides (category-overrides.ts)
// ============================================================================

export const CategoryOverrideEventSchema = z.object({
  category: z.string(),
  from: z.string(),
  to: z.string().refine((t) => isValidTeamId(t) && t !== "all", "invalid team"),
  ts: z.string(),
});

export type CategoryOverrideEvent = z.infer<typeof CategoryOverrideEventSchema>;

export function validateCategoryOverrides(
  data: unknown,
): Record<string, string> {
  if (!data || typeof data !== "object") return {};
  const parsed = data as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && isValidTeamId(v) && v !== "all") {
      out[k] = v;
    }
  }
  return out;
}

// ============================================================================
// Storage: Team Overrides (teams-overrides.ts)
// ============================================================================

export const TeamOverrideEventSchema = z.object({
  from: z.string(),
  to: z.string().refine((t) => isValidTeamId(t) && t !== "all", "invalid team"),
  ts: z.string(),
});

export type TeamOverrideEvent = z.infer<typeof TeamOverrideEventSchema>;

export function validateTeamOverrides(data: unknown): Record<string, string> {
  return validateCategoryOverrides(data); // Same shape
}

// ============================================================================
// Storage: Resident CSAT Ratings (resident-csat.ts)
// ============================================================================

export const CsatRatingSchema = z.enum(["up", "down"]);

export type CsatRating = z.infer<typeof CsatRatingSchema>;

export function validateCsatRatings(data: unknown): Record<string, CsatRating> {
  if (!data || typeof data !== "object") return {};
  const parsed = data as Record<string, unknown>;
  const out: Record<string, CsatRating> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === "up" || v === "down") {
      out[k] = v;
    }
  }
  return out;
}

// ============================================================================
// Storage: Task Completion (task-completion.ts)
// ============================================================================

export const CompletionSchema = z.object({
  completedAt: z.string(),
  afterPhoto: z.string().optional(),
});

export type Completion = z.infer<typeof CompletionSchema>;

export function validateCompletions(data: unknown): Record<string, Completion> {
  if (!data || typeof data !== "object") return {};
  const parsed = data as Record<string, unknown>;
  const out: Record<string, Completion> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "object" || v === null) continue;
    const c = v as Record<string, unknown>;
    if (typeof c.completedAt !== "string") continue;
    out[k] = {
      completedAt: c.completedAt,
      afterPhoto: typeof c.afterPhoto === "string" ? c.afterPhoto : undefined,
    };
  }
  return out;
}

// ============================================================================
// Storage: Upvotes (upvotes.ts)
// ============================================================================

export const UpvoteSetSchema = z.array(z.string());

export function validateUpvotes(data: unknown): Set<string> {
  if (!Array.isArray(data)) return new Set();
  return new Set(data.filter((x): x is string => typeof x === "string"));
}
