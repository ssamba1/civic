"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import type { OverrideEvent } from "@/lib/delegation-history";
import { categoryToTeam, isValidTeamId, type TeamId } from "@/lib/teams";

/* ==================================================================
   Per-report team override store.

   Reports do not carry a persisted `assigned_team` field — default
   routing is derived from `categoryToTeam(report.category)`. Dispatchers
   may override that default for a single report (e.g. a "downed_sign"
   that's actually a fallen tree → reassign from Traffic Engineering to
   Parks & Forestry).

   Overrides are persisted to localStorage so reassignments survive a
   page refresh. The store is shared (single module-level Map) so pure
   derive functions (filter-reports, aggregateByTeam) can read it
   synchronously; React surfaces subscribe via `useTeamOverrides()` to
   re-render on mutation.

   A parallel `historySnapshot` records every reassignment event
   (`{ from, to, ts }`) keyed by report id, so the delegation panel can
   render a per-report audit trail. The `OverrideMap` shape is
   unchanged — existing consumers (filter-reports, aggregateByTeam,
   dashboard derive utils) keep reading `overrides[id]` as a TeamId.

   `setReportTeam` / `clearReportTeam` now accept the report object
   (id + category + assigned_team) so the store can compute the previous
   effective team for the `from` field without each call-site having to
   duplicate the resolution logic.

   When Supabase tables land, swap the localStorage read/write inside
   this module for an RPC. Call-sites (filter-reports, derive utils,
   delegation panel) keep their current shape — `setReportTeam` becomes
   async, `getReportTeam` reads from a cached snapshot.
   ================================================================== */

const STORAGE_KEY = "civic.team_overrides.v1";
const HISTORY_STORAGE_KEY = "civic.team_override_history.v1";

type OverrideMap = Record<string, TeamId>;
type HistoryMap = Record<string, OverrideEvent[]>;

let snapshot: OverrideMap = {};
let historySnapshot: HistoryMap = {};
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): OverrideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: OverrideMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && isValidTeamId(v) && v !== "all") {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStorage(map: OverrideMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — silently drop. In-memory snapshot still works.
  }
}

function readHistoryStorage(): HistoryMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: HistoryMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const events: OverrideEvent[] = [];
      for (const entry of v) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as Record<string, unknown>;
        if (
          typeof e.from === "string" &&
          isValidTeamId(e.from) &&
          e.from !== "all" &&
          typeof e.to === "string" &&
          isValidTeamId(e.to) &&
          e.to !== "all" &&
          typeof e.ts === "string"
        ) {
          events.push({
            from: e.from as TeamId,
            to: e.to as TeamId,
            ts: e.ts,
          });
        }
      }
      if (events.length > 0) out[k] = events;
    }
    return out;
  } catch {
    return {};
  }
}

function writeHistoryStorage(map: HistoryMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — silently drop. In-memory snapshot still works.
  }
}

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  snapshot = readStorage();
  historySnapshot = readHistoryStorage();
  hydrated = true;
  emit();
}

export function getOverridesSnapshot(): OverrideMap {
  return snapshot;
}

export function getHistorySnapshot(): HistoryMap {
  return historySnapshot;
}

/**
 * Resolves the effective team for a report. Reads the persisted override
 * map if present, otherwise falls back to category-derived routing.
 *
 * Pure: takes the override map as an arg so it composes with React's
 * commit cycle (filter-reports gets the map from the hook above it).
 */
export function getReportTeam(
  report: Pick<DashboardReport, "id" | "category" | "assigned_team">,
  overrides: OverrideMap = snapshot,
): TeamId {
  return (
    overrides[report.id] ??
    report.assigned_team ??
    categoryToTeam(report.category)
  );
}

/**
 * Returns the recorded override history for a single report id, in
 * insertion order (oldest first). Empty array if no events recorded.
 */
export function getReportHistory(
  reportId: string,
  history: HistoryMap = historySnapshot,
): OverrideEvent[] {
  return history[reportId] ?? [];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OverrideMap {
  return snapshot;
}

function getHistorySnapshotInternal(): HistoryMap {
  return historySnapshot;
}

// Server snapshots must be referentially stable so React doesn't loop.
const EMPTY: OverrideMap = Object.freeze({}) as OverrideMap;
const EMPTY_HISTORY: HistoryMap = Object.freeze({}) as HistoryMap;
function getServerSnapshot(): OverrideMap {
  return EMPTY;
}
function getServerHistorySnapshot(): HistoryMap {
  return EMPTY_HISTORY;
}

interface UseTeamOverridesReturn {
  overrides: OverrideMap;
  history: HistoryMap;
  setReportTeam: (
    report: Pick<DashboardReport, "id" | "category" | "assigned_team">,
    teamId: TeamId,
  ) => void;
  clearReportTeam: (
    report: Pick<DashboardReport, "id" | "category" | "assigned_team">,
  ) => void;
  clearAll: () => void;
}

export function useTeamOverrides(): UseTeamOverridesReturn {
  // Hydrate from localStorage on first client render. The initial server
  // snapshot is the frozen empty map, which keeps SSR + first CSR aligned;
  // the post-mount swap notifies subscribers via emit().
  useEffect(() => {
    hydrateOnce();
  }, []);

  const overrides = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const history = useSyncExternalStore(
    subscribe,
    getHistorySnapshotInternal,
    getServerHistorySnapshot,
  );

  const setReportTeam = useCallback(
    (
      report: Pick<DashboardReport, "id" | "category" | "assigned_team">,
      teamId: TeamId,
    ) => {
      const prevTeam = getReportTeam(report, snapshot);
      if (teamId === "all") return;
      if (prevTeam === teamId) return;
      snapshot = { ...snapshot, [report.id]: teamId };
      const event: OverrideEvent = {
        from: prevTeam,
        to: teamId,
        ts: new Date().toISOString(),
      };
      const prevEvents = historySnapshot[report.id] ?? [];
      historySnapshot = {
        ...historySnapshot,
        [report.id]: [...prevEvents, event],
      };
      writeStorage(snapshot);
      writeHistoryStorage(historySnapshot);
      emit();
    },
    [],
  );

  const clearReportTeam = useCallback(
    (report: Pick<DashboardReport, "id" | "category" | "assigned_team">) => {
      if (!(report.id in snapshot)) return;
      const prevTeam = snapshot[report.id];
      const defaultTeam =
        report.assigned_team ?? categoryToTeam(report.category);
      const next = { ...snapshot };
      delete next[report.id];
      snapshot = next;
      const event: OverrideEvent = {
        from: prevTeam,
        to: defaultTeam,
        ts: new Date().toISOString(),
      };
      const prevEvents = historySnapshot[report.id] ?? [];
      historySnapshot = {
        ...historySnapshot,
        [report.id]: [...prevEvents, event],
      };
      writeStorage(snapshot);
      writeHistoryStorage(historySnapshot);
      emit();
    },
    [],
  );

  const clearAll = useCallback(() => {
    if (
      Object.keys(snapshot).length === 0 &&
      Object.keys(historySnapshot).length === 0
    ) {
      return;
    }
    snapshot = {};
    historySnapshot = {};
    writeStorage(snapshot);
    writeHistoryStorage(historySnapshot);
    emit();
  }, []);

  return { overrides, history, setReportTeam, clearReportTeam, clearAll };
}
