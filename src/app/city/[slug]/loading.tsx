// Route-level loading shell for the city dashboard. Mirrors page.tsx layout
// (hero + filter bar + teams card grid) so the shimmer placeholder occupies the
// same boxes the real content lands in — no layout shift on hydrate. Shimmer +
// reduced-motion handling live in the shared `.skeleton` utility (globals.css).
export default function CityDashboardLoading() {
  return (
    <div className="flex flex-col min-h-dvh" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full">
              <div className="skeleton h-9 w-40 rounded-lg sm:h-11 lg:h-12" />
              <div className="skeleton mt-3 h-4 w-72 max-w-full rounded-md" />
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="skeleton h-4 w-24 rounded-md" />
                <span className="h-3 w-px bg-white/[0.08] hidden sm:block" aria-hidden="true" />
                <div className="skeleton h-4 w-16 rounded-md" />
                <span className="h-3 w-px bg-white/[0.08] hidden sm:block" aria-hidden="true" />
                <div className="skeleton h-4 w-20 rounded-md" />
              </div>
            </div>
            <div className="skeleton h-11 w-40 shrink-0 self-start rounded-full sm:self-auto" />
          </div>
        </section>

        {/* Filter bar */}
        <div className="mb-6">
          <div className="skeleton h-10 w-full rounded-full" />
        </div>

        {/* Teams card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="skeleton h-5 w-32 rounded-md" />
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
              <div className="skeleton mt-4 h-4 w-full rounded-md" />
              <div className="skeleton mt-2 h-4 w-3/4 rounded-md" />
              <div className="mt-5 flex items-center gap-3">
                <div className="skeleton h-8 w-20 rounded-full" />
                <div className="skeleton h-8 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
