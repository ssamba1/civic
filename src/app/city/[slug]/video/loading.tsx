/* Route-level skeleton for the video console. This route is force-dynamic and
   its server work (clips + clusters + batched signed URLs) is the slowest of
   any city tab, so without this the shell sat blank for the whole render.
   Mirrors the real page's shell — same 1800px column, same pt-city-content
   offset, same static header copy at its real weight — so the swap to real
   content has no geometry shift. Placeholders ride the shared `.skeleton`
   shimmer (theme-aware, reduced-motion safe via globals.css). */

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading video console"
      className="flex flex-col min-h-dvh bg-background"
    >
      <div className="flex-grow mx-auto w-full max-w-[1800px] space-y-4 px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header — static copy, real text, zero-shift swap. */}
        <section className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            Video
          </h1>
          <p className="max-w-[80ch] text-[13px] text-faint">
            Clips are scanned by a local detector (no AI-model cost); only
            confident detection clusters trigger an AI decision run, and only
            dispatch decisions create reports.
          </p>
        </section>

        {/* KPI strip — 5 cells. */}
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {["k1", "k2", "k3", "k4", "k5"].map((k) => (
              <div
                key={k}
                className="min-h-[76px] border-hairline px-4 py-4 [&:not(:last-child)]:border-r"
              >
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton mt-3 h-6 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Clip stage — player surface plus its rail. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="skeleton aspect-video w-full rounded-[var(--radius-lg)]" />
          <div className="space-y-2">
            {["c1", "c2", "c3", "c4"].map((k) => (
              <div
                key={k}
                className="skeleton h-[76px] w-full rounded-[var(--radius-md)]"
              />
            ))}
          </div>
        </div>

        {/* Detections table. */}
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={EYEBROW}>Detections</h2>
            <div className="skeleton h-3 w-24 rounded" />
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
            {["d1", "d2", "d3", "d4", "d5", "d6"].map((k, idx) => (
              <div
                key={k}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx > 0 ? "border-t border-hairline" : ""
                }`}
              >
                <div className="skeleton h-10 w-16 flex-shrink-0 rounded-[var(--radius-md)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-40 rounded" />
                  <div className="skeleton h-3 w-64 rounded" />
                </div>
                <div className="skeleton h-6 w-20 flex-shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
