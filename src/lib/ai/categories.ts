/**
 * Classifiable issue categories, the data behind the AI classification enum
 * and prompt. Isomorphic on purpose (no server-only imports): the classify
 * pipeline builds the effective list per request as BUILTIN ∪ a city's custom
 * issue_types (migration 027), so a category added through the admin UI becomes
 * auto-classifiable with no code deploy (issue #6).
 *
 * The `description` is AI-facing. The model reads it to decide whether a photo
 * fits the category, exactly like crew_types.description drives crew routing.
 * Keep these descriptions in sync with the CATEGORY section that
 * buildClassificationPrompt renders.
 */

export interface CategoryDef {
  /** Canonical slug, a built-in key or a `custom_<slug>` id. */
  key: string;
  /** AI-facing sentence: what this category looks like in a photo. */
  description: string;
}

/** The 12 built-in categories, mirroring the ReportCategory union. The order is
 *  the historical prompt order, stable so the model's menu never reshuffles. */
export const BUILTIN_CATEGORY_DEFS: readonly CategoryDef[] = [
  {
    key: "pothole",
    description:
      "Road surface hole, depression, or severe cracking in asphalt/concrete roadway",
  },
  {
    key: "streetlight",
    description:
      "Street or traffic light outage, broken fixture, or damaged/leaning pole",
  },
  {
    key: "downed_sign",
    description:
      "Traffic or street sign fallen, missing, bent, or knocked off its post",
  },
  {
    key: "graffiti",
    description:
      "Unauthorized markings on public surfaces: walls, sidewalks, benches, bridges",
  },
  {
    key: "illegal_dump",
    description:
      "Household items, appliances, or bulk waste dumped on public land",
  },
  {
    key: "water_leak",
    description:
      "Active main break, gushing hydrant, or pavement pooling from underground pipes",
  },
  {
    key: "sidewalk_damage",
    description:
      "Heaved, sunken, cracked, or missing sidewalk or curb sections",
  },
  {
    key: "tree_down",
    description:
      "Fallen or dangerously leaning tree / large branch on public property or roadway",
  },
  {
    key: "debris",
    description:
      "Loose litter, construction waste, or scattered material on road or path",
  },
  {
    key: "drainage",
    description:
      "Blocked storm drain, flooded roadway, or standing water from drainage failure",
  },
  {
    key: "faded_signage",
    description:
      "Worn, sun-bleached, or barely-legible traffic/street signs still upright",
  },
  {
    key: "other",
    description:
      "Any infrastructure issue that clearly does not fit the above categories",
  },
] as const;

export const BUILTIN_CATEGORY_KEYS: readonly string[] =
  BUILTIN_CATEGORY_DEFS.map((c) => c.key);

const BUILTIN_KEY_SET = new Set(BUILTIN_CATEGORY_KEYS);

/** True when `key` is one of the 12 compile-time categories (ReportCategory). */
export function isBuiltinCategory(key: string): boolean {
  return BUILTIN_KEY_SET.has(key);
}

/**
 * Merge built-in categories with a city's custom issue types into the single
 * ordered list the AI classifier is offered. Customs are appended after the
 * built-ins (deduped by key, "other" always last), so the built-in menu the
 * model has been tuned on stays stable and additions are purely additive.
 */
export function mergeCategoryDefs(
  customs: readonly CategoryDef[],
): CategoryDef[] {
  const seen = new Set(BUILTIN_CATEGORY_KEYS);
  const extras: CategoryDef[] = [];
  for (const c of customs) {
    if (!c.key || seen.has(c.key)) continue;
    seen.add(c.key);
    extras.push({ key: c.key, description: c.description });
  }
  // Keep the built-in fallback "other" last so it reads as the catch-all.
  const builtinsHead = BUILTIN_CATEGORY_DEFS.filter((c) => c.key !== "other");
  const other = BUILTIN_CATEGORY_DEFS.find((c) => c.key === "other");
  return [...builtinsHead, ...extras, ...(other ? [other] : [])];
}
