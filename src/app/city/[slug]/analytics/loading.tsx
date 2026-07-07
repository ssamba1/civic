/* Route-level skeleton — mirrors the AnalyticsInteractive layout shape so the
   transition from this placeholder to the real grid has zero geometry shift.
   Flat Apple-dark panels (#1c1c1e, white/[0.06] hairline) with animate-pulse.
   prefers-reduced-motion users get the static panels (Tailwind's motion-reduce
   neutralizes the pulse). */

function Panel({ className = "" }: { className?: string }) {
  return (
    <div
      className={
        "rounded-[14px] border border-hairline bg-surface " +
        "shadow-[var(--shadow-card)] animate-pulse motion-reduce:animate-none " +
        className
      }
    />
  );
}

export default function Loading() {
  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Hero — static text, no shimmer (matches real page header weight) */}
        <section className="mb-6">
          <h1 className="text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
            Analytics
          </h1>
          <p className="mt-1.5 text-sm text-subtle">
            Operational signal — what&apos;s shipping, what&apos;s stuck, where
            it&apos;s happening.
          </p>
        </section>

        <div className="space-y-4">
          {/* FilterBar placeholder */}
          <Panel className="h-12" />

          {/* KPI row — single panel, 4 cells on lg */}
          <div className="rounded-[14px] border border-hairline bg-surface overflow-hidden shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {["k1", "k2", "k3", "k4"].map((k) => (
                <div
                  key={k}
                  className="px-4 sm:px-5 py-4 sm:py-5 min-h-[80px] border-b border-hairline lg:border-b-0 [&:not(:last-child)]:border-r"
                >
                  <div className="h-3 w-24 rounded bg-overlay-strong animate-pulse motion-reduce:animate-none" />
                  <div className="mt-3 h-7 w-20 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>

          {/* Charts bento (col-span-8) + sticky feed (col-span-4) */}
          <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-8">
              <div className="grid gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(190px,auto)]">
                <Panel className="lg:col-span-8 lg:row-span-2 min-h-[380px] lg:min-h-0" />
                <Panel className="lg:col-span-4 min-h-[190px]" />
                <Panel className="lg:col-span-4 min-h-[190px]" />
                <Panel className="lg:col-span-4 min-h-[190px]" />
                <Panel className="lg:col-span-4 min-h-[190px]" />
                <Panel className="lg:col-span-4 min-h-[190px]" />
                <Panel className="lg:col-span-6 min-h-[190px]" />
                <Panel className="lg:col-span-6 min-h-[190px]" />
              </div>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-4">
              <Panel className="min-h-[420px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
