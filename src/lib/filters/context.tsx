"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCategoryOverrides } from "@/lib/category-overrides";
import type { DashboardReport } from "@/lib/dashboard-data";
import { useDemoReports } from "@/lib/demo-reports";
import {
  filterPreviousWindow,
  filterReports,
} from "@/lib/filters/filter-reports";
import { DEFAULT_FILTER, type ReportFilter } from "@/lib/filters/types";
import { filterToParams, parseFilterFromParams } from "@/lib/filters/url-sync";
import { useTaskCompletion } from "@/lib/task-completion";
import type { TeamId } from "@/lib/teams";
import { useTeamOverrides } from "@/lib/teams-overrides";
import type { ReportStatus } from "@/lib/types";

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
  // When set (team view), the team filter is seeded to this team and locked —
  // every setFilter/patch forces it back, so reused surfaces (map, analytics,
  // lists) only ever see this team's reports. Omit for the city/admin view.
  lockedTeam?: TeamId;
  children: React.ReactNode;
}

export function FilterProvider({
  corpus: baseCorpus,
  now: serverNow,
  lockedTeam,
  children,
}: FilterProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Presenter-injected demo reports (refresh button) are merged into the corpus
  // here — a single point that flows to every map/chart/list consuming this
  // provider. Newest first so they surface at the top of recency-sorted views.
  const { demoReports } = useDemoReports();
  // Task completions resolve into the corpus here — the single chokepoint both
  // the city and team views flow through — so a done task reads as "closed"
  // with its after-photo on every downstream surface (map, charts, lists).
  const { completions } = useTaskCompletion();
  const corpus = useMemo(() => {
    const merged = demoReports.length
      ? [...demoReports, ...baseCorpus]
      : baseCorpus;
    if (Object.keys(completions).length === 0) return merged;
    return merged.map((r) => {
      const c = completions[r.id];
      if (!c) return r;
      return {
        ...r,
        status: "closed" as ReportStatus,
        afterPhoto: c.afterPhoto,
        completed_at: c.completedAt,
      };
    });
  }, [demoReports, baseCorpus, completions]);

  // Initialize once from the URL; subsequent state is owned locally and pushed
  // back to the URL so it stays shareable without re-deriving from params. In
  // the team view, the locked team overrides any team in the URL.
  const [filter, setFilterState] = useState<ReportFilter>(() => {
    const parsed = parseFilterFromParams(
      new URLSearchParams(searchParams.toString()),
    );
    return lockedTeam ? { ...parsed, team: lockedTeam } : parsed;
  });

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
      const scoped = lockedTeam ? { ...next, team: lockedTeam } : next;
      setFilterState(scoped);
      syncUrl(scoped);
    },
    [syncUrl, lockedTeam],
  );

  const patch = useCallback(
    (partial: Partial<ReportFilter>) => {
      const next = { ...filter, ...partial };
      if (lockedTeam) next.team = lockedTeam;
      setFilterState(next);
      syncUrl(next);
    },
    [filter, syncUrl, lockedTeam],
  );

  const reset = useCallback(() => setFilter(DEFAULT_FILTER), [setFilter]);

  // Reassignment overrides feed back into team filtering so toggling a report
  // to another team immediately re-narrows every consumer of useFilteredReports.
  const { overrides } = useTeamOverrides();
  // Subscribe to category-level routing overrides too. The memo doesn't pass
  // them in (filter-reports reads the module-level snapshot via
  // categoryToTeam) but the dep keeps memos invalidated on routing changes.
  const { overrides: categoryOverrides } = useCategoryOverrides();

  // biome-ignore lint/correctness/useExhaustiveDependencies: categoryOverrides is an intentional cache-busting dep — filterReports reads the module-level routing snapshot (categoryToTeam), not this value, so the dep is required to invalidate the memo when category routing changes
  const filtered = useMemo(
    () => filterReports(corpus, filter, now, overrides),
    [corpus, filter, now, overrides, categoryOverrides],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: categoryOverrides is an intentional cache-busting dep — filterPreviousWindow reads the module-level routing snapshot (categoryToTeam), not this value, so the dep is required to invalidate the memo when category routing changes
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
    [
      filter,
      setFilter,
      patch,
      reset,
      isDefault,
      corpus,
      filtered,
      previousWindow,
    ],
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
