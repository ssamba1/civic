"use client";

import { useState, useMemo, useCallback } from "react";
import type { DashboardReport, CityStats, CategoryCount } from "@/lib/dashboard-data";
import type { ReportCategory, ReportStatus } from "@/lib/types";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { RecentReports } from "@/components/dashboard/recent-reports";
import { ReportMapLazy as ReportMap } from "@/components/map/report-map-lazy";

interface DashboardInteractiveProps {
  initialStats: CityStats;
  initialCategories: CategoryCount[];
  initialReports: DashboardReport[];
  center: [number, number];
  zoom: number;
}

export function DashboardInteractive({
  initialStats,
  initialCategories,
  initialReports,
  center,
  zoom,
}: DashboardInteractiveProps) {
  // --- Active Filters State ---
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [minSeverity, setMinSeverity] = useState<number>(1);
  const [activeStatuses, setActiveStatuses] = useState<ReportStatus[]>([
    "open",
    "dispatched",
    "in_progress",
    "closed",
  ]);

  // --- Interaction & Focus State ---
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null); // Clicks (centers map + opens popup)
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null); // Hovers (scales up marker only)

  // --- Filter Logic ---
  const filteredReports = useMemo(() => {
    return initialReports.filter((report) => {
      // 1. Category Filter
      if (selectedCategory && report.category !== selectedCategory) {
        return false;
      }
      // 2. Severity Filter
      if (report.severity < minSeverity) {
        return false;
      }
      // 3. Status Filter
      if (!activeStatuses.includes(report.status)) {
        return false;
      }
      return true;
    });
  }, [initialReports, selectedCategory, minSeverity, activeStatuses]);

  // --- Dynamic Stats calculation ---
  const dynamicStats = useMemo<CityStats>(() => {
    const total = filteredReports.length;
    const open = filteredReports.filter((r) =>
      ["open", "dispatched", "in_progress"].includes(r.status)
    ).length;
    const resolved = filteredReports.filter((r) => r.status === "closed").length;

    return {
      ...initialStats,
      total,
      open,
      resolved,
    };
  }, [filteredReports, initialStats]);

  // --- Callbacks for Category Filtering ---
  const handleSelectCategory = useCallback((category: ReportCategory | null) => {
    setSelectedCategory((prev) => (prev === category ? null : category));
  }, []);

  // --- Callbacks for Sidebar List ---
  const handleHoverReport = useCallback((id: string | null) => {
    setHoveredReportId(id);
  }, []);

  const handleSelectReport = useCallback((id: string) => {
    // Click selected report
    setFocusedReportId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 1. Dynamic Key statistics cards */}
      <section aria-label="Key statistics">
        <StatsCards stats={dynamicStats} />
      </section>

      {/* 2. Interactive Map with overlay controls & Dynamic Markers */}
      <section aria-label="Report locations map" className="relative">
        <ReportMap
          reports={filteredReports}
          center={center}
          zoom={zoom}
          focusId={focusedReportId}
          hoverId={hoveredReportId}
          onSelectMarker={handleSelectReport}
          // Dynamic filter controls bound directly to master state
          minSeverity={minSeverity}
          setMinSeverity={setMinSeverity}
          activeStatuses={activeStatuses}
          setActiveStatuses={setActiveStatuses}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
        />
      </section>

      {/* 3. Two-Column Dashboard Details: Category chart + Recent Reports */}
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <CategoryChart
            data={initialCategories}
            selectedCategory={selectedCategory}
            onSelectCategory={handleSelectCategory}
          />
        </div>
        <div className="lg:col-span-3">
          <RecentReports
            reports={filteredReports}
            focusedId={focusedReportId}
            onHoverReport={handleHoverReport}
            onClickReport={handleSelectReport}
          />
        </div>
      </div>
    </div>
  );
}
