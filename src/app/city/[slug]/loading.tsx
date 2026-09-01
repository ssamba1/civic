// Route-level loading shell for the city dashboard. Mirrors page.tsx: a compact
// header (static Teams title + subtitle, three stat chips), the filter bar
// (desktop inline pill-bar + mobile button), and the TeamsInteractive stack
// (stats cards, team roster grid, workload/routing two-column grid, delegation
// panel), then the footer, so the shimmer placeholders occupy the same boxes
// the real content lands in with no layout shift on hydrate. The title,
// subtitle, and footer need no data, so they render as real text at the real
// weight. Shimmer + reduced-motion handling live in the shared `.skeleton`
// utility (globals.css); every block pairs it with an explicit rounded-*.
export default function CityDashboardLoading() {
  return (
    <div
      className="flex flex-col min-h-dvh"
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Compact page header. Static title + subtitle are instant; only the
            three stat-chip numbers wait on data. */}
        <section className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
                Teams
              </h1>
              <p className="text-[13px] text-faint">
                Workload, delegation, and queue depth across municipal
                divisions.
              </p>
              <div className="flex w-full flex-wrap items-center gap-1.5">
                {["tracked", "open", "this week"].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-[12px] text-subtle"
                  >
                    <span className="skeleton h-3.5 w-6 rounded" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            {/* Sidebar owns the Report CTA on md+; mobile-only here. */}
            <div className="skeleton h-11 w-40 shrink-0 self-start rounded-[var(--radius-md)] md:hidden" />
          </div>
        </section>

        {/* Filter bar, desktop inline pill-bar, mobile single trigger button. */}
        <div className="mb-6">
          <div className="hidden rounded-[14px] border border-hairline bg-surface px-3 py-2.5 md:block">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <div className="skeleton h-4 w-14 rounded" />
              <div className="skeleton h-8 w-32 rounded-[10px]" />
              <div className="skeleton h-8 w-48 rounded-[10px]" />
              <div className="skeleton h-8 w-24 rounded-[10px]" />
              <div className="skeleton h-8 w-20 rounded-[10px]" />
              <div className="skeleton h-8 w-24 rounded-[10px]" />
            </div>
          </div>
          <div className="md:hidden">
            <div className="skeleton h-11 w-full rounded-[14px]" />
          </div>
        </div>

        {/* TeamsInteractive stack */}
        <div className="flex flex-col gap-4">
          {/* Stats cards, 2-up on mobile, 4-up on lg. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {["s1", "s2", "s3", "s4"].map((k) => (
              <div
                key={k}
                className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 sm:p-5"
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="skeleton h-8 w-8 rounded-[var(--radius-md)]" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
                <div className="skeleton h-7 w-16 rounded-md" />
              </div>
            ))}
          </div>

          {/* Team roster, card grid, ramps to 4 columns on xl. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"].map((k) => (
              <div
                key={k}
                className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="skeleton h-7 w-7 rounded-md" />
                    <div className="skeleton h-4 w-20 rounded" />
                  </div>
                  <div className="skeleton h-6 w-8 rounded-md" />
                </div>
                <div className="skeleton h-1.5 w-full rounded-full" />
                <div className="flex items-center justify-between gap-2">
                  <div className="skeleton h-3 w-16 rounded" />
                  <div className="skeleton h-3 w-16 rounded" />
                </div>
                <div className="skeleton mt-0.5 h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>

          {/* Workload bars | routing matrix + changes log */}
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
              <div className="skeleton h-4 w-40 rounded" />
              <div className="mt-4 flex flex-col gap-3">
                {["w1", "w2", "w3", "w4", "w5", "w6"].map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <div className="skeleton h-3 w-24 shrink-0 rounded" />
                    <div className="skeleton h-3 flex-1 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
                <div className="skeleton h-4 w-36 rounded" />
                <div className="mt-4 flex flex-col gap-2.5">
                  {["m1", "m2", "m3", "m4", "m5"].map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <div className="skeleton h-4 flex-1 rounded" />
                      <div className="skeleton h-4 w-20 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="mt-4 flex flex-col gap-2.5">
                  {["l1", "l2", "l3", "l4"].map((k) => (
                    <div key={k} className="skeleton h-4 w-full rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Delegation panel */}
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="skeleton h-4 w-44 rounded" />
              <div className="skeleton h-8 w-28 rounded-[10px]" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {["d1", "d2", "d3", "d4", "d5", "d6"].map((k) => (
                <div key={k} className="skeleton h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-hairline mt-10">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 px-3 py-6 text-[13px] text-faint sm:flex-row sm:px-4 lg:px-6">
          <span>Civic</span>
          <span>
            &copy; {new Date().getFullYear()} &middot; Open311 compatible
          </span>
        </div>
      </footer>
    </div>
  );
}
