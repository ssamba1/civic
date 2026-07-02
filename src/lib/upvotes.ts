"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { validateUpvotes } from "@/lib/schemas";
import { createReactiveStore } from "@/lib/utils/reactive-store";

/* ==================================================================
   Optimistic, client-only upvote store.

   Residents can upvote community reports from the /user/map browse
   list. There is no durable backend yet (PLAN.md §10 / migration 005:
   `report_upvotes` table + count trigger + RLS — approval-gated), so
   this keeps the upvoted-id set in localStorage and surfaces it
   reactively. Display count = a deterministic per-report base + 1 when
   the local user has upvoted.

   Pattern mirrors category-overrides.ts: module-level snapshot for sync
   reads, `useUpvotes()` for React reactivity. When the table lands, swap
   the localStorage read/write for an RPC — call-sites stay unchanged.
   ================================================================== */

const STORAGE_KEY = "civic.upvotes.v1";

type UpvoteSet = ReadonlySet<string>;

let snapshot: UpvoteSet = new Set();
let hydrated = false;

const store = createReactiveStore<UpvoteSet>(() => snapshot, new Set());
const { subscribe, getSnapshot, getServerSnapshot, emit } = store;

function readStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return validateUpvotes(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function writeStorage(set: UpvoteSet) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
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

/**
 * Deterministic per-report base upvote count so the community list reads as
 * populated without a backend. Same hashing approach as map-popup's cost
 * estimate — stable across reloads, varied across reports.
 */
export function baseUpvoteCount(reportId: string, severity = 3): number {
  let hash = 0;
  for (let i = 0; i < reportId.length; i++) {
    hash = reportId.charCodeAt(i) + ((hash << 5) - hash);
  }
  // 0–23 base, nudged up by severity so worse issues trend higher.
  return (Math.abs(hash) % 24) + severity * 2;
}

interface UseUpvotesReturn {
  /** True if the local user has upvoted this report. */
  has: (reportId: string) => boolean;
  /** Display count = deterministic base + 1 when locally upvoted. */
  count: (reportId: string, severity?: number) => number;
  /** Optimistically toggle the local user's upvote. */
  toggle: (reportId: string) => void;
}

export function useUpvotes(): UseUpvotesReturn {
  useEffect(() => {
    hydrateOnce();
  }, []);

  const set = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const has = useCallback((reportId: string) => set.has(reportId), [set]);

  const count = useCallback(
    (reportId: string, severity = 3) =>
      baseUpvoteCount(reportId, severity) + (set.has(reportId) ? 1 : 0),
    [set],
  );

  const toggle = useCallback((reportId: string) => {
    const next = new Set(snapshot);
    if (next.has(reportId)) next.delete(reportId);
    else next.add(reportId);
    snapshot = next;
    writeStorage(snapshot);
    emit();
  }, []);

  return { has, count, toggle };
}
