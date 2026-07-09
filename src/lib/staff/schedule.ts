/**
 * Pure scheduling helpers — no I/O, no DB, no server-only imports.
 * Safe to import from both server and client contexts (types only exported to
 * avoid accidental server-action leakage from client bundles).
 */

import type { Result } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A work order as seen by the scheduler — minimal fields to keep this pure. */
export interface SchedulableWorkOrder {
  id: string;
  /** ISO timestamptz string or null. */
  scheduledFor: string | null;
  /** ISO timestamptz string or null. */
  scheduledWindowEnd: string | null;
  /** UUID or null. */
  assignedCrewId: string | null;
}

export interface ValidateScheduleInput {
  scheduledFor: Date;
  /** Optional. When present must be after scheduledFor and at most 90 days out. */
  windowEnd?: Date;
  /** The reference "now". Defaults to new Date() when omitted. */
  now?: Date;
}

export type ValidateScheduleError =
  | "past_date"
  | "window_before_start"
  | "too_far_out";

/** Detected double-booking for one crew on the same day. */
export interface ScheduleConflict {
  crewId: string;
  date: string; // ISO date YYYY-MM-DD
  workOrderIds: string[]; // two or more overlapping WOs for this crew
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DAYS_OUT = 90;

// ---------------------------------------------------------------------------
// validateSchedule
// ---------------------------------------------------------------------------

/**
 * Validate a proposed schedule window.
 *
 * Rules:
 *  - scheduledFor must be >= now (past dates rejected)
 *  - windowEnd, if provided, must be > scheduledFor
 *  - scheduledFor must be <= now + 90 days
 *
 * Returns `{ ok: true, data: undefined }` on success.
 */
export function validateSchedule(
  input: ValidateScheduleInput,
): Result<undefined, ValidateScheduleError> {
  const { scheduledFor, windowEnd, now = new Date() } = input;

  if (scheduledFor < now) {
    return { ok: false, error: "past_date" };
  }

  const maxDate = new Date(now);
  maxDate.setUTCDate(maxDate.getUTCDate() + MAX_DAYS_OUT);
  if (scheduledFor > maxDate) {
    return { ok: false, error: "too_far_out" };
  }

  if (windowEnd !== undefined && windowEnd <= scheduledFor) {
    return { ok: false, error: "window_before_start" };
  }

  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// groupByDay
// ---------------------------------------------------------------------------

/**
 * Group work orders by their scheduled date (YYYY-MM-DD).
 * Orders whose `scheduledFor` is null are excluded.
 * The returned map preserves insertion order within each day bucket (the
 * caller is expected to sort when rendering if needed).
 */
export function groupByDay(
  workOrders: SchedulableWorkOrder[],
): Map<string, SchedulableWorkOrder[]> {
  const map = new Map<string, SchedulableWorkOrder[]>();
  for (const wo of workOrders) {
    if (!wo.scheduledFor) continue;
    // Slice to date only — drop the time portion. ISO strings are always
    // UTC-normalised from the DB; the first 10 chars are YYYY-MM-DD.
    const day = wo.scheduledFor.slice(0, 10);
    const bucket = map.get(day) ?? [];
    bucket.push(wo);
    map.set(day, bucket);
  }
  return map;
}

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

/**
 * Detect crew double-bookings: multiple work orders assigned to the same crew
 * on the same calendar day (based on scheduledFor date, not time overlap).
 * WOs without a crew or without a schedule are silently skipped.
 */
export function detectConflicts(
  workOrders: SchedulableWorkOrder[],
): ScheduleConflict[] {
  // Map of `crewId|YYYY-MM-DD` -> workOrderIds
  const index = new Map<string, string[]>();

  for (const wo of workOrders) {
    if (!wo.scheduledFor || !wo.assignedCrewId) continue;
    const day = wo.scheduledFor.slice(0, 10);
    const key = `${wo.assignedCrewId}|${day}`;
    const ids = index.get(key) ?? [];
    ids.push(wo.id);
    index.set(key, ids);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [key, ids] of index) {
    if (ids.length < 2) continue;
    const [crewId, date] = key.split("|") as [string, string];
    conflicts.push({ crewId, date, workOrderIds: ids });
  }
  return conflicts;
}
