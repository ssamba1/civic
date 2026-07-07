/* Route-level skeleton — mirrors the Members page shell (header + role chips +
   roster table) so the swap to real content has no geometry shift. Flat surface
   panels with animate-pulse; motion-reduce neutralizes the shimmer. */

const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];

export default function Loading() {
  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header — static text, matches the real page weight. */}
        <section className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            Members
          </h1>
          <p className="text-[13px] text-faint">
            People with access to this city.
          </p>
        </section>

        <div className="flex flex-col gap-4">
          {/* Controls row placeholder. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {["c1", "c2", "c3", "c4", "c5"].map((k) => (
                <div
                  key={k}
                  className="h-8 w-20 rounded-[var(--radius-md)] bg-overlay-strong animate-pulse motion-reduce:animate-none"
                />
              ))}
            </div>
            <div className="h-8 w-full rounded-[var(--radius-md)] bg-overlay-strong animate-pulse motion-reduce:animate-none sm:w-64" />
          </div>

          {/* Table placeholder. */}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
            <div className="border-b border-hairline px-4 py-3">
              <div className="h-3 w-32 rounded bg-overlay-strong animate-pulse motion-reduce:animate-none" />
            </div>
            {ROW_KEYS.map((k) => (
              <div
                key={k}
                className="flex items-center gap-4 border-b border-hairline px-4 py-3.5 last:border-b-0"
              >
                <div className="flex-1">
                  <div className="h-3.5 w-40 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                  <div className="mt-2 h-2.5 w-56 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                </div>
                <div className="h-5 w-20 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                <div className="hidden h-3 w-24 rounded bg-overlay animate-pulse motion-reduce:animate-none sm:block" />
                <div className="hidden h-3 w-16 rounded bg-overlay animate-pulse motion-reduce:animate-none sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
