"use client";

import { useDeferredValue, useMemo, useState } from "react";

import {
  CategoryResolutionTable,
  KpiCards,
  PeakHoursHeatmap,
  RecurringHotspotsCard,
  ReporterVelocityCard,
  ReportsTrend,
  ResolutionHistogram,
  SeverityDonut,
  SlaRiskCard,
  StatusFunnel,
  TopNeighborhoods,
} from "@/components/analytics/analytics-bento";
import { BacklogAge, NeedsAttention } from "@/components/analytics/ops-rail";
import { useReasoningHover } from "@/components/analytics/reasoning-hover";
import { ReportsExplorer } from "@/components/analytics/reports-explorer";
import { RecentReports } from "@/components/dashboard/recent-reports";
import { FilterBar } from "@/components/filters/filter-bar";
import { DEMO_MODE } from "@/lib/demo-mode";
import {
  useFilteredReports,
  usePreviousWindowReports,
} from "@/lib/filters/context";
import {
  deriveBacklogAgeDistribution,
  deriveCategoryResolution,
  deriveHourlyHeatmap,
  deriveKpis,
  deriveNeedsAttention,
  deriveRecurringHotspots,
  deriveReporterVelocity,
  deriveResolutionDistribution,
  deriveSeverityDistribution,
  deriveSlaRisk,
  deriveStatusFunnel,
  deriveTopNeighborhoods,
  deriveTrend,
} from "@/lib/filters/derive";

export function AnalyticsInteractive() {
  const liveFiltered = useFilteredReports();
  const livePrevious = usePreviousWindowReports();
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const reasoning = useReasoningHover();

  // Defer the dataset that feeds the (heavy) chart derivations. The FilterBar
  // reads the live value and repaints its pills instantly; the eight derive*
  // memos below recompute in a low-priority pass off the deferred copy, so a
  // filter change never blocks the click feedback on large datasets.
  const filtered = useDeferredValue(liveFiltered);
  const previous = useDeferredValue(livePrevious);
  // True while React is still rendering the deferred (stale) data — used to dim
  // the grid with a brief pulse so the lag reads as intentional, not frozen.
  const isPending = filtered !== liveFiltered;

  const kpis = useMemo(
    () => deriveKpis(filtered, previous, DEMO_MODE),
    [filtered, previous],
  );
  const trend = useMemo(() => deriveTrend(filtered), [filtered]);
  const distribution = useMemo(
    () => deriveResolutionDistribution(filtered),
    [filtered],
  );
  const funnel = useMemo(() => deriveStatusFunnel(filtered), [filtered]);
  const severity = useMemo(
    () => deriveSeverityDistribution(filtered),
    [filtered],
  );
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
  const hotspots = useMemo(() => deriveRecurringHotspots(filtered), [filtered]);
  const slaRisk = useMemo(() => deriveSlaRisk(filtered), [filtered]);
  const needsAttention = useMemo(
    () => deriveNeedsAttention(filtered),
    [filtered],
  );
  const backlogAge = useMemo(
    () => deriveBacklogAgeDistribution(filtered),
    [filtered],
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <FilterBar />

      {/* Deferred-update region: while React renders the stale snapshot after a
         filter change, dim to 60% so the pause reads as deliberate. Transition
         (not animation) keeps it subtle; reduced-motion users skip the fade. */}
      <div
        className="space-y-4 motion-reduce:transition-none"
        style={{
          opacity: isPending ? 0.6 : 1,
          transition: "opacity 200ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <KpiCards kpis={kpis} />

        {/* Charts bento (lhs) + live reports rail (rhs).
         Mobile: single column stack — charts first, then report feed below.
         lg+: 12-col split — charts col-span-8, sticky feed col-span-4.
         The bento keeps its own internal 12-col grid at lg+, so widening
         this wrapper rescales every tile without touching their spans. */}
        <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-8">
            <div className="bento-flat grid gap-px overflow-clip rounded-[var(--radius-lg)] border border-hairline bg-hairline lg:grid-cols-12 lg:auto-rows-[minmax(190px,auto)]">
              <ReportsTrend data={trend} />
              <SeverityDonut data={severity} />
              <ReporterVelocityCard data={velocity} />
              <StatusFunnel data={funnel} />
              <ResolutionHistogram data={distribution} />
              <PeakHoursHeatmap data={heatmap} />
              <TopNeighborhoods data={neighborhoods} />
              <CategoryResolutionTable data={categoryRes} />
              <RecurringHotspotsCard data={hotspots} />
              <SlaRiskCard data={slaRisk} />
            </div>
          </div>

          {/* Right column: live feed + ops widgets, stacked and scrolling with
           the page. Was sticky, but a sticky rail only fits one short panel — a
           stack has to scroll, so the widgets can live below the feed. */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <RecentReports
              reports={filtered.slice(0, 20)}
              focusedId={focusedReportId}
              onClickReport={setFocusedReportId}
              onExpand={() => setExplorerOpen(true)}
              bindReportHover={reasoning.bindReport}
            />
            <NeedsAttention
              items={needsAttention}
              focusedId={focusedReportId}
              onClickReport={setFocusedReportId}
            />
            <BacklogAge buckets={backlogAge} />
          </div>
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
