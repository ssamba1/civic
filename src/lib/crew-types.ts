// src/lib/crew-types.ts
/* ==================================================================
   Crew types — single source of truth.

   The 7 built-in labor types are what the AI work-order generator
   knows natively (they were previously duplicated in crews-panel,
   crew-actions, and work-order-schema). Cities can add CUSTOM types
   (city_crew_types table, migration 031); a custom type carries a
   >=10-word description that gets injected into the AI prompt so the
   generator can route work orders to it.

   Shared by client (crew dialog) and server (actions, AI schema) —
   keep this module dependency-free and isomorphic.
   ================================================================== */

export const BUILT_IN_CREW_TYPES = [
  "paving",
  "line_crew",
  "sign_crew",
  "cleanup",
  "concrete",
  "arborist",
  "drain_crew",
] as const;

export type BuiltInCrewType = (typeof BUILT_IN_CREW_TYPES)[number];

/** A city-defined crew type as stored in city_crew_types. */
export interface CityCrewType {
  name: string;
  description: string;
}

export const MIN_TYPE_DESCRIPTION_WORDS = 10;
export const MAX_TYPE_DESCRIPTION_CHARS = 500;

export const NAME_RE = /^[a-z0-9][a-z0-9_]{1,39}$/;

/**
 * Normalize a user-typed type name to canonical form: lowercase,
 * trimmed, internal whitespace/underscore runs collapsed to a single
 * underscore ("Street Lights" -> "street_lights"). Returns null when
 * the result isn't a valid name (2-40 chars of [a-z0-9_], starting
 * alphanumeric) — callers surface that as a validation error.
 */
export function normalizeCrewTypeName(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return NAME_RE.test(normalized) ? normalized : null;
}

export function isBuiltInCrewType(name: string): name is BuiltInCrewType {
  return (BUILT_IN_CREW_TYPES as readonly string[]).includes(name);
}

/** Whitespace-separated word count — the >=10-word description gate. */
export function descriptionWordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Display form: underscores read as spaces ("line_crew" -> "line crew"). */
export function crewTypeLabel(name: string): string {
  return name.replace(/_/g, " ");
}
