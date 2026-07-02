"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { validateCategoryOverrides } from "@/lib/schemas";
import { categoryToTeamDefault, isValidTeamId, type TeamId } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";
import { createListenerHub, frozenSnapshot } from "@/lib/utils/reactive-store";

/* ==================================================================
   Per-category default-routing override store.

   `categoryToTeam(category)` is the authoritative resolver for which
   team owns a given report category. The base mapping lives in
   teams.ts (CATEGORY_TO_TEAM, derived from each team's `categories`
   array). Dispatchers can re-aim a category at a different team from
   the routing-matrix UI — that change is persisted here and consulted
   by `categoryToTeam` before the base map.

   Pattern mirrors teams-overrides.ts exactly: module-level snapshot so
   pure derive functions (filter-reports, aggregateByTeam) read sync;
   React surfaces subscribe via `useCategoryOverrides()` for reactivity.

   A parallel `historySnapshot` records every re-route event
   (`{ category, from, to, ts }`) keyed by category, so the routing
   activity feed can render a timestamped audit trail. The `OverrideMap`
   shape is unchanged — existing consumers keep reading
   `overrides[category]` as a TeamId.

   When Supabase tables land, swap the localStorage read/write for an
   RPC against a `routing_overrides` table. Call-sites stay unchanged.
   ================================================================== */

const STORAGE_KEY = "civic.routing_overrides.v1";
const HISTORY_STORAGE_KEY = "civic.routing_override_history.v1";

type OverrideMap = Partial<Record<ReportCategory, TeamId>>;

// Distinct from delegation-history's report-shaped `OverrideEvent`: this is
// category-shaped (no report id) and is never fed to buildTimeline.
export interface CategoryOverrideEvent {
  category: ReportCategory;
  from: TeamId;
  to: TeamId;
  ts: string; // ISO
}

type HistoryMap = Record<string, CategoryOverrideEvent[]>;

let snapshot: OverrideMap = {};
let historySnapshot: HistoryMap = {};
let hydrated = false;

// One shared listener hub — a single `emit()` must notify both the
// primary-map and history `useSyncExternalStore` subscriptions below.
const { subscribe, emit } = createListenerHub();

function readStorage(): OverrideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const validated = validateCategoryOverrides(JSON.parse(raw));
    const out: OverrideMap = {};
    for (const [k, v] of Object.entries(validated)) {
      out[k as ReportCategory] = v as TeamId;
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
      const events: CategoryOverrideEvent[] = [];
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
            category: k as ReportCategory,
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

export function getCategoryOverridesSnapshot(): OverrideMap {
  return snapshot;
}

export function getCategoryHistorySnapshot(): HistoryMap {
  return historySnapshot;
}

function getSnapshot(): OverrideMap {
  return snapshot;
}

function getHistorySnapshotInternal(): HistoryMap {
  return historySnapshot;
}

// Server snapshots must be referentially stable so React doesn't loop.
const getServerSnapshot = frozenSnapshot<OverrideMap>({});
const getServerHistorySnapshot = frozenSnapshot<HistoryMap>({});

function recordEvent(category: ReportCategory, from: TeamId, to: TeamId) {
  if (from === to) return;
  const event: CategoryOverrideEvent = {
    category,
    from,
    to,
    ts: new Date().toISOString(),
  };
  const prevEvents = historySnapshot[category] ?? [];
  historySnapshot = {
    ...historySnapshot,
    [category]: [...prevEvents, event],
  };
}

interface UseCategoryOverridesReturn {
  overrides: OverrideMap;
  history: HistoryMap;
  setCategoryTeam: (category: ReportCategory, teamId: TeamId) => void;
  clearCategoryTeam: (category: ReportCategory) => void;
  clearAll: () => void;
}

export function useCategoryOverrides(): UseCategoryOverridesReturn {
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

  const setCategoryTeam = useCallback(
    (category: ReportCategory, teamId: TeamId) => {
      if (teamId === "all") return;
      const prevTeam = snapshot[category] ?? categoryToTeamDefault(category);
      if (prevTeam === teamId) return;
      snapshot = { ...snapshot, [category]: teamId };
      recordEvent(category, prevTeam, teamId);
      writeStorage(snapshot);
      writeHistoryStorage(historySnapshot);
      emit();
    },
    [],
  );

  const clearCategoryTeam = useCallback((category: ReportCategory) => {
    if (!(category in snapshot)) return;
    const prevTeam = snapshot[category];
    const defaultTeam = categoryToTeamDefault(category);
    const next = { ...snapshot };
    delete next[category];
    snapshot = next;
    if (prevTeam) recordEvent(category, prevTeam, defaultTeam);
    writeStorage(snapshot);
    writeHistoryStorage(historySnapshot);
    emit();
  }, []);

  const clearAll = useCallback(() => {
    if (Object.keys(snapshot).length === 0) return;
    snapshot = {};
    writeStorage(snapshot);
    emit();
  }, []);

  return { overrides, history, setCategoryTeam, clearCategoryTeam, clearAll };
}
