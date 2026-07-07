/* Route-level skeleton — mirrors the member detail shell (back link + profile
   header + stat tiles + timeline/reports columns) so the swap to real content
   has no geometry shift. Flat surface panels with animate-pulse; motion-reduce
   neutralizes the shimmer. */

const TILE_KEYS = ["s1", "s2", "s3", "s4"];
const ROW_KEYS = ["a1", "a2", "a3", "a4", "a5"];

export default function Loading() {
  return (
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Back link placeholder. */}
        <div className="mb-4 h-4 w-24 rounded bg-overlay animate-pulse motion-reduce:animate-none" />

        {/* Profile header. */}
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="w-full">
              <div className="flex items-center gap-3">
                <div className="h-7 w-48 rounded bg-overlay-strong animate-pulse motion-reduce:animate-none" />
                <div className="h-5 w-16 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="mt-3.5 flex flex-wrap gap-3">
                <div className="h-4 w-32 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                <div className="h-4 w-40 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                <div className="h-4 w-28 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="h-3 w-28 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
              <div className="h-3 w-32 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
            </div>
          </div>
        </div>

        {/* Stat tiles. */}
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TILE_KEYS.map((k) => (
            <div
              key={k}
              className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5"
            >
              <div className="h-3 w-24 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
              <div className="mt-3 h-7 w-12 rounded bg-overlay-strong animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>

        {/* Timeline + reports columns. */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)]">
          {["timeline", "reports"].map((col) => (
            <div
              key={col}
              className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="h-4 w-28 rounded bg-overlay-strong animate-pulse motion-reduce:animate-none" />
              <div className="mt-5 flex flex-col gap-4">
                {ROW_KEYS.map((k) => (
                  <div key={k} className="flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-overlay animate-pulse motion-reduce:animate-none" />
                    <div className="flex-1">
                      <div className="h-3.5 w-40 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                      <div className="mt-2 h-2.5 w-24 rounded bg-overlay animate-pulse motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
