/**
 * Crew labor types — the single source of truth for the app-level defaults.
 *
 * A crew type is a *kind* of labor a city fields (paving, arborist, …). Cities
 * define their own catalog in the crew_types table (migration 031, managed on
 * the members page); the rows below are the seed defaults and the universal
 * fallback when a city has no rows yet or the migration hasn't been applied.
 *
 * The description is AI-facing: the work-order generator reads it to pick the
 * right crew_type for a classified report, so it should say what the crew
 * physically does. Keep the seed block in 20260707_031_crew_types.sql in sync.
 *
 * Isomorphic on purpose (no server-only imports) — the members-page dialogs
 * need the same defaults the pipeline uses. DB reads live in
 * src/lib/db/crew-types.ts.
 */

export interface CrewTypeDef {
  key: string;
  label: string;
  description: string;
}

export const DEFAULT_CREW_TYPES: CrewTypeDef[] = [
  {
    key: "paving",
    label: "Paving",
    description:
      "Asphalt work — pothole patching, road surface repair, resurfacing prep.",
  },
  {
    key: "line_crew",
    label: "Line Crew",
    description:
      "Electrical and utility line work — streetlights, downed lines, powered signals.",
  },
  {
    key: "sign_crew",
    label: "Sign Crew",
    description:
      "Traffic sign installation and replacement — downed, faded, or damaged signage.",
  },
  {
    key: "cleanup",
    label: "Cleanup",
    description:
      "Debris removal, illegal dump cleanup, graffiti abatement, general site cleanup.",
  },
  {
    key: "concrete",
    label: "Concrete",
    description:
      "Concrete flatwork — sidewalk panel replacement, curbs, gutters, ADA ramps.",
  },
  {
    key: "arborist",
    label: "Arborist",
    description:
      "Tree work — fallen tree removal, limb trimming, hazardous tree assessment.",
  },
  {
    key: "drain_crew",
    label: "Drain Crew",
    description:
      "Stormwater and drainage — clogged drains, culverts, standing water, water leaks.",
  },
];

export const DEFAULT_CREW_TYPE_KEYS = DEFAULT_CREW_TYPES.map((t) => t.key);

/**
 * Slug shape for crew-type keys — mirrors the CHECK constraint on
 * crew_types.key so client validation and the DB agree.
 */
export const CREW_TYPE_KEY_PATTERN = /^[a-z0-9_]{2,40}$/;

/** Display label for a crew-type key, falling back to the raw key for orphans
 *  (a crew can keep a key whose crew_types row was deleted). */
export function crewTypeLabel(
  key: string | null,
  types: CrewTypeDef[] = DEFAULT_CREW_TYPES,
): string | null {
  if (key === null) return null;
  return types.find((t) => t.key === key)?.label ?? key;
}
