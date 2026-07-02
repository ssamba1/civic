/* ------------------------------------------------------------------
   Delegation history — pure derivation, no React.

   Synthesizes a per-report event timeline from the report's intrinsic
   state (created_at, status, category, severity) plus an optional list
   of override `OverrideEvent`s (the user reassigning team A → B). Used
   by the expandable Delegation row.

   `OverrideEvent` is defined HERE (not in teams-overrides.ts) so this
   module has no dependency on the override store — teams-overrides
   imports the type back from here.
   ------------------------------------------------------------------ */

import type { DashboardReport } from "@/lib/dashboard-data";
import { categoryToTeam, type TeamId } from "@/lib/teams";
import { HOUR_MS } from "@/lib/utils/time-constants";

const DISPATCH_OFFSET_MS = 30 * 60_000; // 30 minutes after creation

/* -------- Types -------- */

export interface OverrideEvent {
  from: TeamId;
  to: TeamId;
  ts: string; // ISO
}

export type TimelineEvent =
  | { kind: "created"; ts: string; defaultTeam: TeamId }
  | { kind: "dispatched"; ts: string; team: TeamId }
  | { kind: "reassigned"; ts: string; from: TeamId; to: TeamId }
  | { kind: "in_progress"; ts: string }
  | { kind: "resolved"; ts: string }
  | { kind: "merged"; ts: string }
  | { kind: "rejected"; ts: string };

/* -------- Functions -------- */

/**
 * Synthetic time-to-resolution. Same formula as filters/derive.ts:24 —
 * kept local on purpose to avoid coupling this module to the analytics
 * derive surface.
 */
export function resolutionHours(report: DashboardReport): number {
  return 12 + report.severity * 18;
}

/**
 * Build an ascending-by-ts event timeline for a single report.
 *
 * Rules:
 * - Always emit `created` at report.created_at with defaultTeam.
 * - status === "rejected" → emit `rejected` at created+30min, stop.
 * - status ∈ {dispatched, in_progress, closed, merged} → emit
 *   `dispatched` at created+30min using defaultTeam (overrides
 *   that fire AFTER dispatch appear as `reassigned` interleaved by ts).
 * - Interleave all OverrideEvents as `reassigned`.
 * - status ∈ {in_progress, closed} → emit `in_progress` at
 *   created + resolutionHours/3 hours.
 * - status === "closed" → emit `resolved` at created + resolutionHours h.
 * - status === "merged" → emit `merged` at created + resolutionHours/2 h.
 * - Final sort ascending by ts.
 */
export function buildTimeline(
  report: DashboardReport,
  history: OverrideEvent[],
): TimelineEvent[] {
  const createdMs = Date.parse(report.created_at);
  const defaultTeam = categoryToTeam(report.category);
  const events: TimelineEvent[] = [];

  // Always: created
  events.push({
    kind: "created",
    ts: report.created_at,
    defaultTeam,
  });

  // Rejected short-circuits the lifecycle.
  if (report.status === "rejected") {
    events.push({
      kind: "rejected",
      ts: new Date(createdMs + DISPATCH_OFFSET_MS).toISOString(),
    });
    return events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }

  // Dispatched chain — fires for any non-open, non-rejected state.
  if (
    report.status === "dispatched" ||
    report.status === "in_progress" ||
    report.status === "closed" ||
    report.status === "merged"
  ) {
    events.push({
      kind: "dispatched",
      ts: new Date(createdMs + DISPATCH_OFFSET_MS).toISOString(),
      team: defaultTeam,
    });
  }

  // Interleave user-recorded override events.
  for (const ev of history) {
    events.push({
      kind: "reassigned",
      ts: ev.ts,
      from: ev.from,
      to: ev.to,
    });
  }

  const hours = resolutionHours(report);

  if (report.status === "in_progress" || report.status === "closed") {
    events.push({
      kind: "in_progress",
      ts: new Date(createdMs + (hours * HOUR_MS) / 3).toISOString(),
    });
  }

  if (report.status === "closed") {
    events.push({
      kind: "resolved",
      ts: new Date(createdMs + hours * HOUR_MS).toISOString(),
    });
  }

  if (report.status === "merged") {
    events.push({
      kind: "merged",
      ts: new Date(createdMs + (hours * HOUR_MS) / 2).toISOString(),
    });
  }

  return events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

/**
 * Count corpus reports that share the target's category AND fall within
 * `radiusMeters` of the target's location. Excludes the target itself by id.
 *
 * Haversine inline (R = 6 371 000 m). No external geo dep.
 */
export function similarNearby(
  target: DashboardReport,
  corpus: DashboardReport[],
  radiusMeters = 500,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const tLat = toRad(target.location.lat);
  const tLng = toRad(target.location.lng);

  let count = 0;
  for (const r of corpus) {
    if (r.id === target.id) continue;
    if (r.category !== target.category) continue;

    const rLat = toRad(r.location.lat);
    const rLng = toRad(r.location.lng);
    const dLat = rLat - tLat;
    const dLng = rLng - tLng;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(tLat) * Math.cos(rLat) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance <= radiusMeters) count++;
  }
  return count;
}
