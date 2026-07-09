/* Route-level skeleton — mirrors the Routing page shell (header + toolbar +
   flow canvas with columns of node-sized blocks) so the swap to the real
   chart has no geometry shift. Placeholders ride the shared `.skeleton`
   shimmer (theme-aware, reduced-motion safe). */

// Column silhouettes roughly matching the flow stages: intake, AI,
// categories, divisions, crews.
const COLUMNS = [
  { k: "intake", blocks: 1, h: "h-[92px]" },
  { k: "ai", blocks: 1, h: "h-[92px]" },
  { k: "categories", blocks: 8, h: "h-[44px]" },
  { k: "teams", blocks: 5, h: "h-[78px]" },
  { k: "crews", blocks: 6, h: "h-[78px]" },
];

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading routing flow"
      className="relative flex min-h-dvh flex-col bg-background"
    >
      <div className="relative mx-auto w-full max-w-[1800px] flex-grow px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Header — instant static text at the real weight, no shimmer. */}
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground">
              Routing
            </h1>
            <p className="text-[13px] text-faint">
              How a report becomes a crew&apos;s job — photo to dispatch, live.
            </p>
          </div>
        </section>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
          {/* Toolbar strip. */}
          <div className="flex items-center justify-between border-b border-hairline bg-overlay/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 rounded-full skeleton" />
              <div className="h-3 w-48 rounded skeleton" />
            </div>
            <div className="flex items-center gap-1">
              <div className="h-7 w-7 rounded-[var(--radius-md)] skeleton" />
              <div className="h-7 w-7 rounded-[var(--radius-md)] skeleton" />
              <div className="h-7 w-7 rounded-[var(--radius-md)] skeleton" />
            </div>
          </div>

          {/* Flow canvas — stage columns of node-shaped placeholders. */}
          <div className="overflow-hidden p-7">
            <div className="flex min-h-[420px] items-center gap-[84px]">
              {COLUMNS.map((col) => (
                <div key={col.k} className="flex w-44 flex-col gap-2.5">
                  {Array.from(
                    { length: col.blocks },
                    (_, i) => `${col.k}-${i}`,
                  ).map((key) => (
                    <div
                      key={key}
                      className={`w-full rounded-[var(--radius-md)] skeleton ${col.h}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
