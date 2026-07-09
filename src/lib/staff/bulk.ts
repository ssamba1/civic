/**
 * Pure validation helpers for bulk staff operations.
 * No DB calls, no server-only imports — safe to import anywhere.
 */

import type { Result } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BULK_MAX = 100;

export const BULK_ACTIONS = [
  "assign_team",
  "set_status",
  "set_priority",
  "acknowledge",
] as const;

export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Valid report statuses that staff may set in bulk */
const ALLOWED_STATUSES = [
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "rejected",
] as const;

/** Valid priority values */
const ALLOWED_PRIORITIES = ["low", "medium", "high", "critical"] as const;

// ---------------------------------------------------------------------------
// UUID validation
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Selection validation
// ---------------------------------------------------------------------------

/**
 * Validates a bulk selection of report IDs.
 * - Must be non-empty
 * - Must contain at most BULK_MAX entries
 * - Every entry must be a valid UUID
 * - Duplicates are silently removed (returned set is deduped)
 */
export function validateBulkSelection(ids: unknown): Result<string[]> {
  if (!Array.isArray(ids)) {
    return { ok: false, error: "ids_must_be_array" };
  }

  if (ids.length === 0) {
    return { ok: false, error: "ids_empty" };
  }

  // Dedup first, then check limit so the user doesn't get a confusing error
  const deduped = [...new Set<string>(ids.filter((id) => typeof id === "string"))];

  if (deduped.length === 0) {
    return { ok: false, error: "ids_empty" };
  }

  if (deduped.length > BULK_MAX) {
    return { ok: false, error: `ids_exceeds_limit_${BULK_MAX}` };
  }

  for (const id of deduped) {
    if (!isUuid(id)) {
      return { ok: false, error: `invalid_uuid:${id}` };
    }
  }

  return { ok: true, data: deduped };
}

// ---------------------------------------------------------------------------
// Action + value validation
// ---------------------------------------------------------------------------

/**
 * Validates that the given action is in the allowlist and that the value
 * is appropriate for the action.
 *
 * - assign_team: value must be a non-empty string (team id / key)
 * - set_status:  value must be one of ALLOWED_STATUSES
 * - set_priority: value must be one of ALLOWED_PRIORITIES
 * - acknowledge:  value is ignored / may be empty
 */
export function validateBulkAction(
  action: unknown,
  value: unknown,
): Result<{ action: BulkAction; value: string | null }> {
  if (typeof action !== "string") {
    return { ok: false, error: "action_must_be_string" };
  }

  if (!(BULK_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: `unknown_action:${action}` };
  }

  const a = action as BulkAction;

  switch (a) {
    case "acknowledge":
      return { ok: true, data: { action: a, value: null } };

    case "assign_team": {
      if (typeof value !== "string" || value.trim() === "") {
        return { ok: false, error: "assign_team_requires_team_id" };
      }
      return { ok: true, data: { action: a, value: value.trim() } };
    }

    case "set_status": {
      if (
        typeof value !== "string" ||
        !(ALLOWED_STATUSES as readonly string[]).includes(value)
      ) {
        return {
          ok: false,
          error: `invalid_status:${value} allowed:${ALLOWED_STATUSES.join(",")}`,
        };
      }
      return { ok: true, data: { action: a, value } };
    }

    case "set_priority": {
      if (
        typeof value !== "string" ||
        !(ALLOWED_PRIORITIES as readonly string[]).includes(value)
      ) {
        return {
          ok: false,
          error: `invalid_priority:${value} allowed:${ALLOWED_PRIORITIES.join(",")}`,
        };
      }
      return { ok: true, data: { action: a, value } };
    }
  }
}
