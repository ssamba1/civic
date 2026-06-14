"use client";

import { useCallback, useSyncExternalStore } from "react";
import { validateCsatRatings } from "@/lib/schemas";

/* ==================================================================
   Resident satisfaction (CSAT) overlay store.

   When a resident rates a resolved report ("Was this fixed?" 👍/👎), the
   verdict lives here — keyed by report id — not on the report itself (the
   demo corpus has no write API, and real persistence is a Phase-1b backend
   concern). Mirrors task-completion.ts exactly: a module-level snapshot read
   synchronously, useSyncExternalStore for React reactivity, persisted to
   localStorage so the rating survives reloads on the same device.

   The research (Buell/Porter/Norton) ties the satisfaction prompt-on-close to
   re-engagement; the one-tap rating IS the response (no separate form), so the
   click both records the verdict and closes the loop visually.
   ================================================================== */

const STORAGE_KEY = "civic.resident_csat.v1";

export type Rating = "up" | "down";
export type CsatMap = Record<string, Rating>;

let snapshot: CsatMap = {};
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): CsatMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return validateCsatRatings(JSON.parse(raw));
  } catch {
    return {};
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  snapshot = readStorage();
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CsatMap {
  ensureHydrated();
  return snapshot;
}

// Server render has no localStorage — return a stable empty map so SSR and the
// first client paint agree (no hydration mismatch); the effect-driven
// subscribe/getSnapshot fills it in after mount.
const SERVER_SNAPSHOT: CsatMap = {};
function getServerSnapshot(): CsatMap {
  return SERVER_SNAPSHOT;
}

export function rateReport(reportId: string, rating: Rating): void {
  ensureHydrated();
  if (snapshot[reportId] === rating) return;
  snapshot = { ...snapshot, [reportId]: rating };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota / private mode — keep the in-memory verdict, just don't persist.
  }
  emit();
}

/** React hook: the resident's rating for one report (or undefined). */
export function useReportRating(reportId: string): Rating | undefined {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return map[reportId];
}

/** Stable setter bound to a report id. */
export function useRateReport(reportId: string): (rating: Rating) => void {
  return useCallback(
    (rating: Rating) => rateReport(reportId, rating),
    [reportId],
  );
}
