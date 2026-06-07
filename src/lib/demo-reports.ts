"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import type { WorkOrderWithDetails } from "@/lib/types";

/** A report/work-order belongs to the injected demo overlay. Used for the glow. */
export const DEMO_REPORTER_ID = "demo-reporter";
export const isDemoId = (id: string | null | undefined): boolean =>
  !!id && id.startsWith("demo-");

/* ==================================================================
   Demo-report overlay store.

   A presenter clicks "Refresh" (staff inbox) to inject a live demo
   data point — the fallen tree photographed in a Cumming parking lot —
   and it appears across every client surface that renders reports
   (map, delegation, analytics, dashboard, inbox) with a blue glow.
   A small global "Reset demo" button clears them.

   Mirrors category-overrides.ts: a module-level snapshot read
   synchronously by derive helpers, plus useSyncExternalStore for React
   reactivity. Persisted to localStorage so it survives reload; the
   reset button (or clearing storage) wipes it. No DB writes.
   ================================================================== */

const STORAGE_KEY = "civic.demo_reports.v1";

// Cumming center → small fixed offset so the marker lands on a plausible
// commercial parking lot near the city core (not jittered per render).
const C = KNOWN_CITIES.cumming.center;

// The demo data point: a large hardwood down across a medical-office parking
// lot off Tribble Gap Rd. Photo is the presenter's own field shot (IMG_4622),
// stored at seed/demo-tree.jpg so it rides only this injected point and leaves
// the generic category seed images untouched. `ai_reasoning` is the baked
// classification shown in expanded views.
function buildDemoTree(n: number): DashboardReport {
  return {
    id: `demo-tree-${n}`,
    category: "tree_down",
    severity: 3,
    status: "open",
    address: "415 Tribble Gap Rd",
    location: { lng: C[0] + 0.006, lat: C[1] + 0.004 },
    photo_public_url:
      "https://gisoowyezwhdrozettbg.supabase.co/storage/v1/object/public/photos-public/seed/demo-tree.jpg",
    created_at: new Date().toISOString(),
    reporter_id: DEMO_REPORTER_ID,
    tags: ["storm", "parking-lot", "blocking-access"],
    demo: true,
    ai_reasoning:
      "Large hardwood down across 3 parking spaces at the medical-office lot off Tribble Gap Rd. Blocking two vehicles and the pedestrian path; no downed power lines visible in frame. Classified tree_down at severity 3 — property access blocked, no injury risk. Auto-routed to Parks & Recreation / Urban Forestry; recommend a chainsaw crew, ~1 hr cleanup, and a hazard cone in the interim.",
  };
}

let snapshot: DashboardReport[] = [];
let counter = 0;
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

function readStorage(): DashboardReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Keep the highest demo-N so re-added points don't collide with persisted ids.
    for (const r of parsed as DashboardReport[]) {
      const m = /^demo-tree-(\d+)$/.exec(r?.id ?? "");
      if (m) counter = Math.max(counter, Number(m[1]));
    }
    return parsed as DashboardReport[];
  } catch {
    return [];
  }
}

function writeStorage(list: DashboardReport[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota / private mode — in-memory snapshot still drives the UI this session.
  }
}

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  snapshot = readStorage();
  hydrated = true;
  emit();
}

export function getDemoReportsSnapshot(): DashboardReport[] {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DashboardReport[] {
  return snapshot;
}

// Referentially-stable frozen server snapshot — matches the Object.freeze({})
// pattern used by every other store in this codebase.
const EMPTY: DashboardReport[] = Object.freeze([] as DashboardReport[]) as DashboardReport[];
function getServerSnapshot(): DashboardReport[] {
  return EMPTY;
}

/** Add one fresh demo report (newest first). Call from a client event handler. */
export function addDemoReport(): DashboardReport {
  counter += 1;
  const report = buildDemoTree(counter);
  snapshot = [report, ...snapshot];
  writeStorage(snapshot);
  emit();
  return report;
}

/** Clear all injected demo reports. */
export function resetDemoReports() {
  if (snapshot.length === 0) return;
  snapshot = [];
  writeStorage(snapshot);
  emit();
}

/**
 * Adapt a demo DashboardReport into the staff inbox's WorkOrderWithDetails
 * shape, so clicking Refresh also drops the tree into the inbox list.
 */
export function demoWorkOrderFromReport(r: DashboardReport): WorkOrderWithDetails {
  return {
    id: `demo-wo-${r.id}`,
    report_id: r.id,
    department: "Parks & Recreation",
    crew_type: "forestry",
    priority_score: 72,
    est_minutes: 60,
    materials: ["chainsaw", "wood chipper", "hazard cones"],
    assigned_crew_id: null,
    dispatched_at: null,
    completed_at: null,
    resolution_photo_url: null,
    resolution_ai_score: null,
    report: {
      id: r.id,
      city_id: "cumming",
      reporter_id: r.reporter_id,
      location: r.location,
      photo_public_url: r.photo_public_url,
      photo_raw_url: null,
      status: r.status,
      address: r.address,
      description:
        "Large tree down across the parking lot — blocking two vehicles and the pedestrian walkway.",
      created_at: r.created_at,
      updated_at: r.created_at,
    },
    classification: {
      category: r.category,
      subcategory: "fallen_hardwood",
      severity: r.severity,
      hazard_radius_m: 8,
      visible_size_estimate: "~12 m canopy",
      is_emergency: false,
      confidence: 0.93,
      reasoning: r.ai_reasoning ?? "",
    },
  };
}

interface UseDemoReportsReturn {
  demoReports: DashboardReport[];
  add: () => DashboardReport;
  reset: () => void;
}

export function useDemoReports(): UseDemoReportsReturn {
  useEffect(() => {
    hydrateOnce();
  }, []);

  const demoReports = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const add = useCallback(() => addDemoReport(), []);
  const reset = useCallback(() => resetDemoReports(), []);

  return { demoReports, add, reset };
}
