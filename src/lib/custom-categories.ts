"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { DEMO_MODE } from "@/lib/demo-mode";
import { validateCustomCategories } from "@/lib/schemas";
import { categoryToTeam, isValidTeamId, type TeamId } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";
import { createReactiveStore } from "@/lib/utils/reactive-store";

/* ==================================================================
   User-defined issue types ("custom categories").

   The built-in report categories are a compile-time TS union
   (`ReportCategory`) and every `Record<ReportCategory, …>` is
   exhaustive over it — so a category the dispatcher invents at runtime
   *cannot* join that union. It lives here instead, in a parallel store
   that the routing matrix merges in for display.

   Scope is deliberately the routing config only: a custom type records
   which team it should route to (editable via the same TeamPicker), but
   it does not feed `categoryToTeam`/CATEGORY_META — the AI classifier
   only emits the fixed union, so a custom type won't *receive*
   auto-classified reports until that classifier is extended.

   Pattern mirrors category-overrides.ts exactly: module-level snapshot
   so non-React readers stay sync, React surfaces subscribe via
   `useCustomCategories()`. When Supabase tables land, swap the
   localStorage read/write for an RPC against an `issue_types` table.
   ================================================================== */

const STORAGE_KEY = "civic.custom_categories.v1";

/**
 * DB leg (live deploy only): fire-and-forget upsert/delete against the
 * city-scoped issue_types table (migration 027) via the staff-gated server
 * actions. localStorage stays the instant-UI layer; demo deploy unchanged.
 */
function persistIssueType(
  c: CustomCategory | { id: string; remove: true },
): void {
  if (DEMO_MODE) return;
  void import("@/app/staff/actions")
    .then((actions) =>
      "remove" in c
        ? actions.deleteIssueType(c.id)
        : actions.saveIssueType({
            key: c.id,
            label: c.label,
            description: c.description,
            color: c.color,
            teamKey: c.team,
          }),
    )
    .then((result) => {
      if (result && !result.ok) {
        console.warn(`[custom-categories] DB persist failed: ${result.error}`);
      }
    })
    .catch((err) => {
      console.warn("[custom-categories] DB persist threw", err);
    });
}

export interface CustomCategory {
  /** Always `custom_<slug>` so it never collides with a built-in key. */
  id: string;
  label: string;
  /** AI-facing description (issue #6) — what a photo of this issue looks like.
   *  Empty when the dispatcher didn't supply one; then the type routes only on
   *  a manual pick, never AI auto-classification. */
  description?: string;
  color: string;
  team: TeamId;
}

let snapshot: CustomCategory[] = [];
let hydrated = false;

const store = createReactiveStore<CustomCategory[]>(() => snapshot, []);
const { subscribe, getSnapshot, getServerSnapshot, emit } = store;

function readStorage(): CustomCategory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const validated = validateCustomCategories(parsed);
    // Tolerate a stale/renamed team in storage rather than crashing the row.
    return validated.map((v) => ({
      ...v,
      // Schema already guarantees a valid, non-"all" team; the cast keeps the
      // runtime guard defensive against stale storage without tripping TS2367.
      team:
        (v.team as string) !== "all" && isValidTeamId(v.team)
          ? (v.team as TeamId)
          : "general_admin",
    }));
  } catch {
    return [];
  }
}

function writeStorage(list: CustomCategory[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base.length > 0 ? base : "type";
}

function uniqueId(label: string, existing: CustomCategory[]): string {
  const slug = slugify(label);
  let candidate = `custom_${slug}`;
  let n = 2;
  const taken = new Set(existing.map((c) => c.id));
  while (taken.has(candidate)) {
    candidate = `custom_${slug}_${n}`;
    n += 1;
  }
  return candidate;
}

export function getCustomCategoriesSnapshot(): CustomCategory[] {
  return snapshot;
}

interface UseCustomCategoriesReturn {
  categories: CustomCategory[];
  addCustomCategory: (input: {
    label: string;
    description?: string;
    color: string;
    team: TeamId;
  }) => string;
  removeCustomCategory: (id: string) => void;
  setCustomCategoryTeam: (id: string, team: TeamId) => void;
}

export function useCustomCategories(): UseCustomCategoriesReturn {
  useEffect(() => {
    hydrateOnce();
  }, []);

  const categories = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const addCustomCategory = useCallback(
    (input: {
      label: string;
      description?: string;
      color: string;
      team: TeamId;
    }) => {
      const label = input.label.trim();
      const team = input.team === "all" ? "general_admin" : input.team;
      const id = uniqueId(label, snapshot);
      const created: CustomCategory = {
        id,
        label,
        description: input.description?.trim() || undefined,
        color: input.color,
        team,
      };
      snapshot = [...snapshot, created];
      writeStorage(snapshot);
      emit();
      persistIssueType(created);
      return id;
    },
    [],
  );

  const removeCustomCategory = useCallback((id: string) => {
    if (!snapshot.some((c) => c.id === id)) return;
    snapshot = snapshot.filter((c) => c.id !== id);
    writeStorage(snapshot);
    emit();
    persistIssueType({ id, remove: true });
  }, []);

  const setCustomCategoryTeam = useCallback((id: string, team: TeamId) => {
    if (team === "all") return;
    let changed = false;
    const next = snapshot.map((c) => {
      if (c.id !== id || c.team === team) return c;
      changed = true;
      return { ...c, team };
    });
    if (!changed) return;
    snapshot = next;
    writeStorage(snapshot);
    emit();
    const updated = next.find((c) => c.id === id);
    if (updated) persistIssueType(updated);
  }, []);

  return {
    categories,
    addCustomCategory,
    removeCustomCategory,
    setCustomCategoryTeam,
  };
}

/* ------------------------------------------------------------------
   Issue-type resolution — unifies the built-in `ReportCategory` union
   with runtime custom categories so a manual picker (report form) can
   list both and resolve either to its routing team without the AI
   classifier. Pure functions; pass the reactive `custom` list from
   `useCustomCategories()` so callers re-render on changes.
   ------------------------------------------------------------------ */

export interface IssueTypeOption {
  /** A built-in `ReportCategory` value or a `custom_<slug>` id. */
  value: string;
  label: string;
  color: string;
  isCustom: boolean;
}

export function builtinIssueTypeOptions(): IssueTypeOption[] {
  return (Object.keys(CATEGORY_META) as ReportCategory[]).map((c) => ({
    value: c,
    label: CATEGORY_META[c].label,
    color: CATEGORY_META[c].color,
    isCustom: false,
  }));
}

export function customIssueTypeOptions(
  custom: CustomCategory[],
): IssueTypeOption[] {
  return custom.map((c) => ({
    value: c.id,
    label: c.label,
    color: c.color,
    isCustom: true,
  }));
}

/** Resolve a built-in category OR a custom id to its routing team. */
export function resolveIssueTypeTeam(
  value: string,
  custom: CustomCategory[],
): TeamId {
  const hit = custom.find((c) => c.id === value);
  if (hit) return hit.team;
  if (value in CATEGORY_META) return categoryToTeam(value as ReportCategory);
  return "general_admin";
}

/** Resolve display meta (label + color) for a built-in category or custom id. */
export function resolveIssueTypeMeta(
  value: string,
  custom: CustomCategory[],
): { label: string; color: string; isCustom: boolean } | null {
  const hit = custom.find((c) => c.id === value);
  if (hit) return { label: hit.label, color: hit.color, isCustom: true };
  if (value in CATEGORY_META) {
    const m = CATEGORY_META[value as ReportCategory];
    return { label: m.label, color: m.color, isCustom: false };
  }
  return null;
}
