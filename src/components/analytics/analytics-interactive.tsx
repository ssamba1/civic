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
import { ReportsExplorer } from "@/components/analytics/reports-explorer";
import { useReasoningHover } from "@/components/analytics/reasoning-hover";
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
  const [explorerOpen, setExplorerOpen] = useState(false);
  const reasoning = useReasoningHover();

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

      {/* Charts bento (lhs) + live reports rail (rhs).
         The rail is col-span-4 and pinned; charts take col-span-8 so the
         time-series, heatmap, and category table get real width. The bento
         keeps its own internal 12-col grid, so widening this wrapper rescales
         every tile without touching their individual spans. */}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8">
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

        {/* Live report feed — sticky rail. self-start collapses the column to
           content height so position:sticky engages. Reasoning is no longer
           inline here; hovering a row surfaces it as a portal hover card
           (useReasoningHover) so deep content reads at full width with no
           in-rail scroll. */}
        <div className="lg:col-span-4 flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <RecentReports
            reports={filtered.slice(0, 20)}
            focusedId={focusedReportId}
            onClickReport={setFocusedReportId}
            onExpand={() => setExplorerOpen(true)}
            bindReportHover={reasoning.bindReport}
          />
        </div>
      </div>

      <reasoning.Portal />
      <ReportsExplorer
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        reports={filtered}
      />
    </div>
  );
}
