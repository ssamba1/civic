// Route-level loading skeleton. Mirrors the browse page layout shape so the
// swap into real content is positionally stable (no layout shift). Shimmer via
// animate-pulse only — transforms/opacity safe, no layout animation.
export default function BrowseLoading() {
  return (
    <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-6">
      {/* Header */}
      <section className="mb-6 sm:mb-8">
        <div className="h-3 w-32 rounded bg-overlay-strong" />
        <div className="mt-2 h-9 w-64 rounded-lg bg-overlay-strong sm:h-11" />
        <div className="mt-3 h-4 w-72 rounded bg-overlay" />
      </section>

      {/* Filter bar placeholder */}
      <div className="mb-4 sm:mb-6">
        <div className="h-[52px] w-full rounded-[14px] border border-hairline bg-surface animate-pulse" />
      </div>

      <div className="space-y-8" aria-hidden>
        {/* Stats cards: 4 cells, 2-col mobile → 4-col desktop */}
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {["s1", "s2", "s3", "s4"].map((k) => (
              <div
                key={k}
                className="px-4 py-4 sm:px-5 sm:py-5 border-hairline [&:nth-child(odd)]:border-r [&:nth-child(-n+2)]:border-b lg:[&:not(:last-child)]:border-r lg:[&:nth-child(-n+2)]:border-b-0"
              >
                <div className="mb-3 h-2.5 w-20 rounded bg-overlay-strong animate-pulse" />
                <div className="h-7 w-16 rounded bg-overlay-strong animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Map placeholder */}
        <div className="h-[400px] w-full rounded-xl border border-hairline bg-surface animate-pulse" />

        {/* Chart (3) + list (2) grid */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-xl border border-hairline bg-surface p-5">
            <div className="h-4 w-28 rounded bg-overlay-strong" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton, fixed order
                <div key={i} className="space-y-1.5">
                  <div
                    className="h-3 rounded bg-overlay-strong animate-pulse"
                    style={{ width: `${70 - i * 9}%` }}
                  />
                  <div className="h-1 w-full rounded-full bg-overlay" />
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-xl border border-hairline bg-surface p-4">
            <div className="h-4 w-20 rounded bg-overlay-strong" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton, fixed order
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-3/4 rounded bg-overlay-strong animate-pulse" />
                  <div className="h-2.5 w-1/2 rounded bg-overlay animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
