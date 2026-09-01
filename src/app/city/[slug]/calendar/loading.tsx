/* Route-level skeleton, mirrors the Calendar page shell (header + nav/filter
   bar + 6x7 month grid) so the swap to real content has no geometry shift.
   Placeholders ride the shared `.skeleton` shimmer (theme-aware, reduced-
   motion safe). */

const WEEK_KEYS = ["w1", "w2", "w3", "w4", "w5", "w6"];
const DAY_KEYS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];

// Filter fields vary in width in the real bar (Division / Crew type / Crew /
// Status), stagger the placeholder widths to match.
const FILTERS = [
  { k: "f1", w: "w-44" },
  { k: "f2", w: "w-44" },
  { k: "f3", w: "w-44" },
  { k: "f4", w: "w-44" },
];

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading calendar"
      className="relative flex flex-col min-h-dvh bg-background"
    >
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header, instant static text at the real weight, no shimmer. */}
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Calendar
            </h1>
            <p className="text-[13px] text-faint">
              Work orders landing in this city.
            </p>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          {/* Month heading + nav row. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-4 w-32 rounded skeleton" />
              <div className="flex items-center gap-1">
                <div className="h-9 w-9 rounded-[var(--radius-md)] skeleton" />
                <div className="h-9 w-16 rounded-[var(--radius-md)] skeleton" />
                <div className="h-9 w-9 rounded-[var(--radius-md)] skeleton" />
              </div>
            </div>
            <div className="h-3 w-24 rounded skeleton" />
          </div>

          {/* Filter bar. */}
          <div className="flex flex-wrap items-end gap-2">
            {FILTERS.map((f) => (
              <div key={f.k} className="flex flex-col gap-1">
                <div className="h-2.5 w-16 rounded skeleton" />
                <div
                  className={`h-8 ${f.w} rounded-[var(--radius-md)] skeleton`}
                />
              </div>
            ))}
          </div>

          {/* Month grid, weekday header + 6x7 cells, same shell as real. */}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-7 border-b border-hairline bg-overlay/50">
              {DAY_KEYS.map((k) => (
                <div key={k} className="px-2 py-1.5">
                  <div className="mx-auto h-2 w-6 rounded skeleton" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {WEEK_KEYS.map((week) =>
                DAY_KEYS.map((day) => (
                  <div
                    key={`${week}-${day}`}
                    className="flex min-h-28 flex-col gap-1 border-r border-b border-hairline p-1.5"
                  >
                    <div className="h-2.5 w-4 rounded skeleton" />
                    <div className="h-3.5 w-full rounded skeleton" />
                  </div>
                )),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
