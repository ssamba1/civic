"use client";

import { useState, useMemo, useCallback } from "react";
import type { CityStats, CategoryCount } from "@/lib/dashboard-data";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { RecentReports } from "@/components/dashboard/recent-reports";
import { ReportMapLazy as ReportMap } from "@/components/map/report-map-lazy";
import { useFilteredReports, useFilters } from "@/lib/filters/context";

const ALL_STATUSES: ReportStatus[] = [
  "open",
  "dispatched",
  "in_progress",
  "closed",
  "merged",
  "rejected",
];

const BACKLOG_STATUSES: ReportStatus[] = ["open", "dispatched", "in_progress"];

interface DashboardInteractiveProps {
  initialStats: CityStats;
  center: [number, number];
  zoom: number;
  upvotedIds?: string[];
}

export function DashboardInteractive({
  initialStats,
  center,
  zoom,
  upvotedIds = [],
}: DashboardInteractiveProps) {
  const { filter, patch } = useFilters();
  const filteredReports = useFilteredReports();

  // Map click focus is purely local interaction state.
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);

  // --- Stats derived from the shared filtered set ---
  const dynamicStats = useMemo<CityStats>(() => {
    const total = filteredReports.length;
    const open = filteredReports.filter((r) =>
      BACKLOG_STATUSES.includes(r.status),
    ).length;
    const resolved = filteredReports.filter((r) => r.status === "closed").length;
    return { ...initialStats, total, open, resolved };
  }, [filteredReports, initialStats]);

  // --- Category breakdown derived from the shared filtered set ---
  const categories = useMemo<CategoryCount[]>(() => {
    const counts = new Map<ReportCategory, number>();
    for (const r of filteredReports) {
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredReports]);

  // --- Adapters: map overlay controls write to the shared filter ---
  const selectedCategory =
    filter.categories.length === 1 ? filter.categories[0] : null;

  const setSelectedCategory = useCallback(
    (cat: ReportCategory | null) => {
      patch({ categories: cat ? [cat] : [] });
    },
    [patch],
  );

  const handleSelectCategory = useCallback(
    (cat: ReportCategory | null) => {
      // Toggle behavior: clicking the active category clears it.
      patch({ categories: cat && selectedCategory !== cat ? [cat] : [] });
    },
    [patch, selectedCategory],
  );

  const activeStatuses = filter.statuses.length ? filter.statuses : ALL_STATUSES;

  const setActiveStatuses = useCallback(
    (next: ReportStatus[]) => {
      patch({ statuses: next.length === ALL_STATUSES.length ? [] : next });
    },
    [patch],
  );

  const setMinSeverity = useCallback(
    (n: number) => {
      const clamped = Math.min(5, Math.max(1, Math.round(n))) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      patch({ minSeverity: clamped });
    },
    [patch],
  );

  const handleSelectReport = useCallback((id: string) => {
    setFocusedReportId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <section aria-label="Key statistics">
        <StatsCards stats={dynamicStats} />
      </section>

      <section aria-label="Report locations map" className="relative">
        <ReportMap
          reports={filteredReports}
          center={center}
          zoom={zoom}
          focusId={focusedReportId}
          onSelectMarker={handleSelectReport}
          minSeverity={filter.minSeverity}
          setMinSeverity={setMinSeverity}
          activeStatuses={activeStatuses}
          setActiveStatuses={setActiveStatuses}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CategoryChart
            data={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
          />
        </div>
        <div className="lg:col-span-2">
          <RecentReports
            reports={filteredReports}
            focusedId={focusedReportId}
            onClickReport={handleSelectReport}
            upvotedIds={upvotedIds}
          />
        </div>
      </div>
    </div>
  );
}
