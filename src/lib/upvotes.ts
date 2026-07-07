"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEMO_MODE } from "@/lib/demo-mode";
import { validateUpvotes } from "@/lib/schemas";
import { createReactiveStore } from "@/lib/utils/reactive-store";

/* ==================================================================
   Optimistic upvote store.

   Residents upvote community reports from the /user/map browse list.
   The upvoted-id set lives in localStorage (instant toggle, survives
   reload); on a LIVE deploy each toggle also writes the caller's own
   report_upvotes row (migration 027) and displayed counts come from
   the report_upvote_counts aggregate RPC, batched per render pass. On
   the demo deploy counts stay the deterministic synthetic base.

   Pattern mirrors category-overrides.ts: module-level snapshot for sync
   reads, `useUpvotes()` for React reactivity.
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
 * estimate — stable across reloads, varied across reports. DEMO ONLY — the
 * live deploy shows real counts from report_upvote_counts (below).
 */
export function baseUpvoteCount(reportId: string, severity = 3): number {
  let hash = 0;
  for (let i = 0; i < reportId.length; i++) {
    hash = reportId.charCodeAt(i) + ((hash << 5) - hash);
  }
  // 0–23 base, nudged up by severity so worse issues trend higher.
  return (Math.abs(hash) % 24) + severity * 2;
}

/* ------------------------------------------------------------------
   Live counts (live deploy only). Rendering a count registers its report
   id; ids batch into one report_upvote_counts RPC call (migration 027 —
   aggregate only, no user ids) ~1 tick later. Fetched counts land in a
   module map, a version bump re-renders subscribers, and toggle()
   adjusts the cached count optimistically alongside its DB write.
   ------------------------------------------------------------------ */

const liveCounts = new Map<string, number>();
const pendingCountIds = new Set<string>();
let countsVersion = 0;
let countsTimer: ReturnType<typeof setTimeout> | null = null;

function getCountsVersion(): number {
  return countsVersion;
}

function requestLiveCount(reportId: string): void {
  if (DEMO_MODE || typeof window === "undefined") return;
  if (liveCounts.has(reportId) || pendingCountIds.has(reportId)) return;
  pendingCountIds.add(reportId);
  if (countsTimer) return;
  countsTimer = setTimeout(async () => {
    const ids = [...pendingCountIds];
    pendingCountIds.clear();
    countsTimer = null;
    try {
      const { createBrowserSupabase } = await import("@/lib/db/browser-client");
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("report_upvote_counts", {
        _report_ids: ids,
      });
      // Un-migrated DB / transient failure: record zeros so we don't refetch
      // in a loop; the next page load retries naturally.
      for (const id of ids) liveCounts.set(id, 0);
      if (!error) {
        for (const row of (data ?? []) as {
          report_id: string;
          upvotes: number;
        }[]) {
          liveCounts.set(row.report_id, Number(row.upvotes));
        }
      }
    } catch {
      for (const id of ids) liveCounts.set(id, 0);
    }
    countsVersion++;
    emit();
  }, 120);
}

interface UseUpvotesReturn {
  /** True if the local user has upvoted this report. */
  has: (reportId: string) => boolean;
  /** Demo: deterministic base + 1 when locally upvoted. Live: real DB count. */
  count: (reportId: string, severity?: number) => number;
  /** Optimistically toggle the local user's upvote. */
  toggle: (reportId: string) => void;
}

export function useUpvotes(): UseUpvotesReturn {
  useEffect(() => {
    hydrateOnce();
  }, []);

  const set = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const version = useSyncExternalStore(subscribe, getCountsVersion, () => 0);

  const has = useCallback((reportId: string) => set.has(reportId), [set]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is intentionally extra — it invalidates the closure when the module-level live-count map updates.
  const count = useCallback(
    (reportId: string, severity = 3) => {
      if (DEMO_MODE) {
        return (
          baseUpvoteCount(reportId, severity) + (set.has(reportId) ? 1 : 0)
        );
      }
      // Registering during render is safe: it only schedules a batched fetch
      // (idempotent, no synchronous state change); the version bump re-renders.
      requestLiveCount(reportId);
      return liveCounts.get(reportId) ?? 0;
    },
    [set, version],
  );

  const toggle = useCallback((reportId: string) => {
    const next = new Set(snapshot);
    const upvoted = !next.has(reportId);
    if (upvoted) next.add(reportId);
    else next.delete(reportId);
    snapshot = next;
    writeStorage(snapshot);
    if (!DEMO_MODE) {
      // Keep the displayed live count in step with the optimistic toggle.
      const current = liveCounts.get(reportId) ?? 0;
      liveCounts.set(reportId, Math.max(0, current + (upvoted ? 1 : -1)));
      countsVersion++;
    }
    emit();
    persistUpvote(reportId, upvoted);
  }, []);

  return { has, count, toggle };
}
