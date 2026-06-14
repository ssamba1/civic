"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { validateCompletions } from "@/lib/schemas";
import type { ReportStatus } from "@/lib/types";

/* ==================================================================
   Task-completion overlay store.

   When a team marks a task done in the team view, the completion lives
   here — keyed by report id — not on the report itself (the corpus is a
   deterministic generated dataset with no write API). FilterProvider
   resolves this overlay into the shared corpus, so a done task reads as
   "closed" with its after-photo across every surface (team + city map,
   analytics, lists) with no per-component changes.

   Mirrors teams-overrides.ts exactly: a module-level snapshot read
   synchronously by pure derives, plus useSyncExternalStore for React
   reactivity, persisted to localStorage (quota-safe). No DB writes.

   The after-photo is a downscaled JPEG data URL (see
   lib/utils/downscale-image.ts) so it fits the ~5 MB origin quota.
   ================================================================== */

const STORAGE_KEY = "civic.task_completion.v1";

export interface Completion {
  completedAt: string;
  /** Downscaled JPEG data URL of the "after" photo. Optional — a task can be
   *  marked done without one. */
  afterPhoto?: string;
}

export type CompletionMap = Record<string, Completion>;

let snapshot: CompletionMap = {};
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): CompletionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return validateCompletions(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeStorage(map: CompletionMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — in-memory snapshot still drives the session.
    // After-photos are downscaled before storage to keep this rare.
  }
}

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  snapshot = readStorage();
  hydrated = true;
  emit();
}

export function getCompletionsSnapshot(): CompletionMap {
  return snapshot;
}

export function getReportCompletion(
  report: Pick<DashboardReport, "id">,
  map: CompletionMap = snapshot,
): Completion | undefined {
  return map?.[report.id];
}

/** Effective status: a completed task reads as "closed", else the corpus value. */
export function resolveReportStatus(
  report: Pick<DashboardReport, "id" | "status">,
  map: CompletionMap = snapshot,
): ReportStatus {
  return map?.[report.id] ? "closed" : report.status;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CompletionMap {
  return snapshot;
}

// Referentially stable server snapshot so SSR + first CSR align.
const EMPTY: CompletionMap = Object.freeze({}) as CompletionMap;
function getServerSnapshot(): CompletionMap {
  return EMPTY;
}

interface UseTaskCompletionReturn {
  completions: CompletionMap;
  markDone: (report: Pick<DashboardReport, "id">, afterPhoto?: string) => void;
  reopen: (report: Pick<DashboardReport, "id">) => void;
  clearAll: () => void;
}

export function useTaskCompletion(): UseTaskCompletionReturn {
  useEffect(() => {
    hydrateOnce();
  }, []);

  const completions = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const markDone = useCallback(
    (report: Pick<DashboardReport, "id">, afterPhoto?: string) => {
      snapshot = {
        ...snapshot,
        [report.id]: { completedAt: new Date().toISOString(), afterPhoto },
      };
      writeStorage(snapshot);
      emit();
    },
    [],
  );

  const reopen = useCallback((report: Pick<DashboardReport, "id">) => {
    if (!(report.id in snapshot)) return;
    const next = { ...snapshot };
    delete next[report.id];
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

  return { completions, markDone, reopen, clearAll };
}
