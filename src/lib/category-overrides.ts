"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ReportCategory } from "@/lib/types";
import { isValidTeamId, type TeamId } from "@/lib/teams";

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

   When Supabase tables land, swap the localStorage read/write for an
   RPC against a `routing_overrides` table. Call-sites stay unchanged.
   ================================================================== */

const STORAGE_KEY = "civic.routing_overrides.v1";

type OverrideMap = Partial<Record<ReportCategory, TeamId>>;

let snapshot: OverrideMap = {};
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
        out[k as ReportCategory] = v;
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

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  snapshot = readStorage();
  hydrated = true;
  emit();
}

export function getCategoryOverridesSnapshot(): OverrideMap {
  return snapshot;
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

const EMPTY: OverrideMap = Object.freeze({}) as OverrideMap;
function getServerSnapshot(): OverrideMap {
  return EMPTY;
}

interface UseCategoryOverridesReturn {
  overrides: OverrideMap;
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

  const setCategoryTeam = useCallback(
    (category: ReportCategory, teamId: TeamId) => {
      if (teamId === "all") return;
      snapshot = { ...snapshot, [category]: teamId };
      writeStorage(snapshot);
      emit();
    },
    [],
  );

  const clearCategoryTeam = useCallback((category: ReportCategory) => {
    if (!(category in snapshot)) return;
    const next = { ...snapshot };
    delete next[category];
    snapshot = next;
    writeStorage(snapshot);
    emit();
  }, []);

  const clearAll = useCallback(() => {
    if (Object.keys(snapshot).length === 0) return;
    snapshot = {};
    writeStorage(snapshot);
    emit();
  }, []);

  return { overrides, setCategoryTeam, clearCategoryTeam, clearAll };
}
