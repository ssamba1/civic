/* Route-level skeleton, mirrors the AnalyticsInteractive layout shape so the
   transition from this placeholder to the real grid has zero geometry shift.
   Every placeholder rides the shared `.skeleton` shimmer (theme-aware,
   reduced-motion safe via globals.css) and pairs it with an explicit rounded-*
   so the utility wins over the layered base rule. */

function Panel({ className = "" }: { className?: string }) {
  return (
    <div className={`skeleton shadow-[var(--shadow-card)] ${className}`} />
  );
}

// Per-index divider classes: 2-col mobile grid → 4-col desktop row.
// Mirrors KpiCards' BORDER_CLASSES so the KPI cell dividers match exactly.
const KPI_BORDER = [
  "border-r border-b lg:border-b-0 border-hairline",
  "border-b lg:border-b-0 lg:border-r border-hairline",
  "border-r border-hairline",
  "",
];

export default function Loading() {
  return (
    <div
      className="relative flex flex-col min-h-dvh bg-background"
      role="status"
      aria-busy="true"
      aria-label="Loading analytics"
    >
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Compact page header, real static text, no shimmer (matches the
           real page's slim single-row header weight exactly). */}
        <section className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            Analytics
          </h1>
          <p className="text-[13px] text-faint">
            Operational signal, what&apos;s shipping, what&apos;s stuck, where
            it&apos;s happening.
          </p>
        </section>

        <div className="space-y-4">
          {/* FilterBar placeholder */}
          <Panel className="h-12 rounded-[14px]" />

          {/* KPI row, single card, 4 cells (2-col mobile → 4-col lg) */}
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface overflow-hidden shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {["k1", "k2", "k3", "k4"].map((k, idx) => (
                <div
                  key={k}
                  className={`px-4 sm:px-5 py-4 sm:py-5 min-h-[80px] ${KPI_BORDER[idx]}`}
                >
                  <div className="skeleton h-3 w-24 rounded" />
                  <div className="skeleton mt-3 h-7 w-20 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Charts bento (col-span-8) + sticky feed rail (col-span-4) */}
          <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-8">
              <div className="grid gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(190px,auto)]">
                {/* ReportsTrend */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-8 lg:row-span-2 min-h-[380px] lg:min-h-0" />
                {/* SeverityDonut */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-4 min-h-[190px]" />
                {/* ReporterVelocityCard */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-4 min-h-[190px]" />
                {/* StatusFunnel */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-4 min-h-[190px]" />
                {/* ResolutionHistogram */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-8 min-h-[190px]" />
                {/* PeakHoursHeatmap */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-8 min-h-[190px]" />
                {/* TopNeighborhoods */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-4 min-h-[190px]" />
                {/* CategoryResolutionTable */}
                <Panel className="rounded-[var(--radius-lg)] lg:col-span-12 min-h-[190px]" />
              </div>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <Panel className="rounded-[var(--radius-lg)] min-h-[420px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
