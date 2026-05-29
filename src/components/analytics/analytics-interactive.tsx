"use client";

import { useMemo, useState } from "react";

import {
  KpiCards,
  ReportsTrend,
  SeverityDonut,
  StatusFunnel,
  ResolutionHistogram,
  PeakHoursHeatmap,
  TopNeighborhoods,
  CategoryResolutionTable,
  ReporterVelocityCard,
} from "@/components/analytics/analytics-bento";
import { FilterBar } from "@/components/filters/filter-bar";
import { RecentReports } from "@/components/dashboard/recent-reports";
import { ReasoningCard } from "@/components/analytics/reasoning-card";
import {
  useFilteredReports,
  usePreviousWindowReports,
} from "@/lib/filters/context";
import {
  deriveCategoryResolution,
  deriveHourlyHeatmap,
  deriveKpis,
  deriveReporterVelocity,
  deriveResolutionDistribution,
  deriveSeverityDistribution,
  deriveStatusFunnel,
  deriveTopNeighborhoods,
  deriveTrend,
} from "@/lib/filters/derive";

export function AnalyticsInteractive() {
  const filtered = useFilteredReports();
  const previous = usePreviousWindowReports();
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);

  const kpis = useMemo(() => deriveKpis(filtered, previous), [filtered, previous]);
  const trend = useMemo(() => deriveTrend(filtered), [filtered]);
  const distribution = useMemo(
    () => deriveResolutionDistribution(filtered),
    [filtered],
  );
  const funnel = useMemo(() => deriveStatusFunnel(filtered), [filtered]);
  const severity = useMemo(() => deriveSeverityDistribution(filtered), [filtered]);
  const heatmap = useMemo(() => deriveHourlyHeatmap(filtered), [filtered]);
  const neighborhoods = useMemo(
    () => deriveTopNeighborhoods(filtered),
    [filtered],
  );
  const categoryRes = useMemo(
    () => deriveCategoryResolution(filtered),
    [filtered],
  );
  const velocity = useMemo(() => deriveReporterVelocity(filtered), [filtered]);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <FilterBar />

      <KpiCards kpis={kpis} />

      {/* Main grid + reports + reasoning detail */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(190px,auto)]">
            <ReportsTrend data={trend} />
            <SeverityDonut data={severity} />
            <ReporterVelocityCard data={velocity} />
            <StatusFunnel data={funnel} />
            <ResolutionHistogram data={distribution} />
            <PeakHoursHeatmap data={heatmap} />
            <TopNeighborhoods data={neighborhoods} />
            <CategoryResolutionTable data={categoryRes} />
          </div>
        </div>

        {/* Recent reports + reasoning sidebar */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <RecentReports
            reports={filtered.slice(0, 20)}
            focusedId={focusedReportId}
            onClickReport={setFocusedReportId}
          />

          {focusedReportId && (
            <>
              <button
                onClick={() => setFocusedReportId(null)}
                className="text-[12px] text-zinc-400 hover:text-white transition-colors"
              >
                ← Clear selection
              </button>
              <ReasoningCard reportId={focusedReportId} className="flex-1" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
