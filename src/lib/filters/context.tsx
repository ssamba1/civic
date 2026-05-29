"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardReport } from "@/lib/dashboard-data";
import { filterPreviousWindow, filterReports } from "@/lib/filters/filter-reports";
import { type ReportFilter, DEFAULT_FILTER } from "@/lib/filters/types";
import { filterToParams, parseFilterFromParams } from "@/lib/filters/url-sync";
import { useTeamOverrides } from "@/lib/teams-overrides";
import { useCategoryOverrides } from "@/lib/category-overrides";

interface FilterContextValue {
  filter: ReportFilter;
  setFilter: (next: ReportFilter) => void;
  patch: (partial: Partial<ReportFilter>) => void;
  reset: () => void;
  isDefault: boolean;
  corpus: DashboardReport[];
  filtered: DashboardReport[];
  previousWindow: DashboardReport[];
}

const FilterContext = createContext<FilterContextValue | null>(null);

interface FilterProviderProps {
  corpus: DashboardReport[];
  // Server-computed reference time. Passed from the (server) layout alongside
  // the corpus so window math is identical on SSR and the first client render —
  // a client-side Date.now() would drift past window boundaries and trip a
  // hydration mismatch.
  now: number;
  children: React.ReactNode;
}

export function FilterProvider({ corpus, now: serverNow, children }: FilterProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize once from the URL; subsequent state is owned locally and pushed
  // back to the URL so it stays shareable without re-deriving from params.
  const [filter, setFilterState] = useState<ReportFilter>(() =>
    parseFilterFromParams(new URLSearchParams(searchParams.toString())),
  );

  // Stable `now` for the lifetime of the provider so window math doesn't drift
  // between renders (and SSR/CSR stay aligned). Seeded from the server value.
  const nowRef = useRef<number>(serverNow);
  const now = nowRef.current;

  const syncUrl = useCallback(
    (next: ReportFilter) => {
      const qs = filterToParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFilter = useCallback(
    (next: ReportFilter) => {
      setFilterState(next);
      syncUrl(next);
    },
    [syncUrl],
  );

  const patch = useCallback(
    (partial: Partial<ReportFilter>) => {
      setFilterState((prev) => {
        const next = { ...prev, ...partial };
        syncUrl(next);
        return next;
      });
    },
    [syncUrl],
  );

  const reset = useCallback(() => setFilter(DEFAULT_FILTER), [setFilter]);

  // Reassignment overrides feed back into team filtering so toggling a report
  // to another team immediately re-narrows every consumer of useFilteredReports.
  const { overrides } = useTeamOverrides();
  // Subscribe to category-level routing overrides too. The memo doesn't pass
  // them in (filter-reports reads the module-level snapshot via
  // categoryToTeam) but the dep keeps memos invalidated on routing changes.
  const { overrides: categoryOverrides } = useCategoryOverrides();

  const filtered = useMemo(
    () => filterReports(corpus, filter, now, overrides),
    [corpus, filter, now, overrides, categoryOverrides],
  );
  const previousWindow = useMemo(
    () => filterPreviousWindow(corpus, filter, now, overrides),
    [corpus, filter, now, overrides, categoryOverrides],
  );

  const isDefault = useMemo(
    () =>
      filter.preset === DEFAULT_FILTER.preset &&
      filter.minSeverity === DEFAULT_FILTER.minSeverity &&
      filter.categories.length === 0 &&
      filter.statuses.length === 0 &&
      filter.team === DEFAULT_FILTER.team,
    [filter],
  );

  const value = useMemo<FilterContextValue>(
    () => ({
      filter,
      setFilter,
      patch,
      reset,
      isDefault,
      corpus,
      filtered,
      previousWindow,
    }),
    [filter, setFilter, patch, reset, isDefault, corpus, filtered, previousWindow],
  );

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return ctx;
}

export function useFilters() {
  const { filter, setFilter, patch, reset, isDefault } = useFilterContext();
  return { filter, setFilter, patch, reset, isDefault };
}

export function useFilteredReports(): DashboardReport[] {
  return useFilterContext().filtered;
}

export function usePreviousWindowReports(): DashboardReport[] {
  return useFilterContext().previousWindow;
}

export function useReportCorpus(): DashboardReport[] {
  return useFilterContext().corpus;
}
