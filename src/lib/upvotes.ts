"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEMO_MODE } from "@/lib/demo-mode";
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

/**
 * DB leg of a toggle (live deploy only): fire-and-forget insert/delete of the
 * caller's own report_upvotes row (migration 027; RLS enforces
 * user_id = auth.uid()). localStorage stays the optimistic layer; a failure
 * (e.g. a synthetic report id with no DB row) is logged and the local state
 * stands — correct demo behavior, self-healing on the next real toggle.
 */
function persistUpvote(reportId: string, upvoted: boolean): void {
  if (DEMO_MODE) return;
  void import("@/lib/db/browser-client")
    .then(async ({ createBrowserSupabase }) => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      const { error } = upvoted
        ? await supabase
            .from("report_upvotes")
            .upsert(
              { report_id: reportId, user_id: userId },
              { onConflict: "report_id,user_id", ignoreDuplicates: true },
            )
        : await supabase
            .from("report_upvotes")
            .delete()
            .eq("report_id", reportId)
            .eq("user_id", userId);
      if (error) {
        console.warn(`[upvotes] DB persist failed: ${error.message}`);
      }
    })
    .catch((err) => {
      console.warn("[upvotes] DB persist threw", err);
    });
}

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
    const upvoted = !next.has(reportId);
    if (upvoted) next.add(reportId);
    else next.delete(reportId);
    snapshot = next;
    writeStorage(snapshot);
    emit();
    persistUpvote(reportId, upvoted);
  }, []);

  return { has, count, toggle };
}
