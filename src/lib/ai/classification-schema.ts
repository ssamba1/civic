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
