// Route-level loading skeleton. Mirrors the browse page layout shape so the
// swap into real content is positionally stable (no layout shift). All
// placeholders ride the shared `.skeleton` shimmer (theme-aware + reduced-motion
// safe). The page's static <h1>/subtitle need no data, so they render as real
// text at their real weight. The map surface is structurally forced-dark (its
// lazy loader paints a dark grid), so that subtree is scoped `dark` and the
// shared tokens resolve their dark values instead of hardcoding hex.
export default function BrowseLoading() {
  return (
    <div
      className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-6"
      role="status"
      aria-busy="true"
      aria-label="Loading reports"
    >
      {/* Header — eyebrow (city name) is data, so it shimmers; the title and
          subtitle are static copy and render as real text (zero-shift swap). */}
      <section className="mb-6 sm:mb-8">
        <div className="skeleton h-3 w-32 rounded" />
        <h1 className="mt-1 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          Browse local issues
        </h1>
        <p className="mt-2 sm:mt-3 text-sm text-subtle">
          See what's happening in your neighborhood.
        </p>
      </section>

      {/* Filter bar — mobile is a min-h-11 trigger button, desktop a 52px bar. */}
      <div className="mb-4 sm:mb-6">
        <div className="skeleton h-11 w-full rounded-[14px] md:h-[52px]" />
      </div>

      <div className="space-y-8" aria-hidden>
        {/* Stats cards: 4 separate cards, gap-4, 2-col mobile → 4-col desktop */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {["s1", "s2", "s3", "s4"].map((k) => (
            <div
              key={k}
              className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 sm:p-5"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <div className="skeleton h-8 w-8 rounded-[var(--radius-md)]" />
                <div className="skeleton h-2.5 w-20 rounded" />
              </div>
              <div className="skeleton h-7 w-16 rounded" />
            </div>
          ))}
        </div>

        {/* Map: responsive height matches the lazy map loader; forced-dark, so
            scope it `dark` for the shimmer to resolve its dark surface. */}
        <div className="dark">
          <div className="skeleton h-[300px] w-full rounded-xl sm:h-[450px] lg:h-[550px]" />
        </div>

        {/* Chart (3) + list (2) grid */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
          {/* Category chart */}
          <div className="lg:col-span-3 rounded-xl border border-hairline bg-surface p-4 sm:p-5">
            <div className="border-b border-hairline pb-4">
              <div className="skeleton h-4 w-24 rounded" />
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton, fixed order
                <div key={i} className="px-2 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="skeleton h-2 w-2 rounded-full" />
                      <div
                        className="skeleton h-3 rounded"
                        style={{ width: `${104 - i * 12}px` }}
                      />
                    </div>
                    <div className="skeleton h-3 w-6 rounded" />
                  </div>
                  <div className="mt-1.5 h-1 w-full rounded-full bg-overlay" />
                </div>
              ))}
            </div>
          </div>

          {/* Recent reports list */}
          <div className="lg:col-span-2 rounded-xl border border-hairline bg-surface p-3 sm:p-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="skeleton h-4 w-20 rounded" />
              <div className="skeleton h-3 w-6 rounded" />
            </div>
            <div className="mt-2 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton, fixed order
                <div key={i} className="flex flex-col gap-1.5 px-2 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="skeleton h-2 w-2 rounded-full" />
                      <div className="skeleton h-3 w-28 rounded" />
                    </div>
                    <div className="skeleton h-[18px] w-14 rounded-md" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="skeleton h-3 w-32 rounded" />
                    <div className="skeleton h-3 w-12 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
