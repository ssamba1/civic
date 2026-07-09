/**
 * Contractor work-order status state machine.
 *
 * This module is PURE (no server/DB imports) so it can be imported on both
 * client and server, and tested in isolation via Vitest.
 *
 * Lifecycle:
 *   assigned ──► accepted ──► in_progress ──► complete
 *       │
 *       └──► declined
 *
 * A contractor who has declined cannot reactivate; staff must re-assign.
 * A completed work order cannot be reopened from the contractor side.
 */

export const CONTRACTOR_STATUSES = [
  "assigned",
  "accepted",
  "declined",
  "in_progress",
  "complete",
] as const;

export type ContractorStatus = (typeof CONTRACTOR_STATUSES)[number];

/** Human-readable labels for each contractor status. */
export const CONTRACTOR_STATUS_LABEL: Record<ContractorStatus, string> = {
  assigned: "Assigned",
  accepted: "Accepted",
  declined: "Declined",
  in_progress: "In Progress",
  complete: "Complete",
};

/** Valid transitions: from → set of allowed targets. */
const VALID_TRANSITIONS: Record<ContractorStatus, ReadonlySet<ContractorStatus>> =
  {
    assigned: new Set<ContractorStatus>(["accepted", "declined"]),
    accepted: new Set<ContractorStatus>(["in_progress", "declined"]),
    declined: new Set<ContractorStatus>([]), // terminal — staff must re-assign
    in_progress: new Set<ContractorStatus>(["complete"]),
    complete: new Set<ContractorStatus>([]), // terminal
  };

/**
 * Returns true if transitioning from `from` to `to` is a legal move.
 * Passing the same status as both from and to is always false (no self-loops).
 */
export function canTransition(
  from: ContractorStatus,
  to: ContractorStatus,
): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS[from].has(to);
}

export interface ProgressUpdateInput {
  workOrderId: string;
  status: ContractorStatus;
  note?: string;
  photoUrl?: string;
}

export type ProgressUpdateError =
  | "invalid_work_order_id"
  | "invalid_status"
  | "note_too_long"
  | "photo_url_too_long"
  | "photo_url_not_https";

/**
 * Validates the shape of a progress update before it touches the DB.
 * Returns { ok: true } or { ok: false, error }.
 *
 * Does NOT check whether the transition is legal from the current DB state —
 * that requires knowing the current status, which is done in the server action
 * after fetching the row (so we can defend against race conditions).
 */
export function validateProgressUpdate(
  input: ProgressUpdateInput,
): { ok: true } | { ok: false; error: ProgressUpdateError } {
  // UUID-shaped work order id (basic sanity, not exhaustive UUID regex)
  if (
    typeof input.workOrderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.workOrderId,
    )
  ) {
    return { ok: false, error: "invalid_work_order_id" };
  }

  if (!CONTRACTOR_STATUSES.includes(input.status)) {
    return { ok: false, error: "invalid_status" };
  }

  if (input.note !== undefined) {
    if (typeof input.note !== "string" || input.note.length > 2000) {
      return { ok: false, error: "note_too_long" };
    }
  }

  if (input.photoUrl !== undefined && input.photoUrl !== "") {
    if (typeof input.photoUrl !== "string" || input.photoUrl.length > 2048) {
      return { ok: false, error: "photo_url_too_long" };
    }
    // Must be HTTPS (public CDN / storage bucket URL, never raw).
    if (!input.photoUrl.startsWith("https://")) {
      return { ok: false, error: "photo_url_not_https" };
    }
  }

  return { ok: true };
}
