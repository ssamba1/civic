/* Route-level skeleton for the Documents console. force-dynamic + staff-gated,
   so the shell previously waited on the auth round trip and the corpus query
   before painting anything. Mirrors the real page's shell: same 1800px column,
   same pt-city-content offset, same left-rail / retrieval two-column grid.
   Static header copy renders as real text (zero-shift swap); the rest rides the
   shared `.skeleton` shimmer (theme-aware, reduced-motion safe). */

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading documents"
      className="flex flex-col min-h-dvh bg-background"
    >
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
            Documents
          </h1>
          {/* The city name is data, so the sentence it sits in shimmers rather
              than rendering half-written copy. */}
          <div className="skeleton h-3 w-[min(100%,60ch)] rounded" />
        </section>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          <div className="space-y-4">
            {/* Upload card. */}
            <div className="skeleton h-[190px] w-full rounded-[var(--radius-lg)]" />

            {/* Corpus list. */}
            <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <h2 className={EYEBROW}>Corpus</h2>
                <div className="skeleton h-3 w-28 rounded" />
              </div>
              {["r1", "r2", "r3", "r4", "r5"].map((k, idx) => (
                <div
                  key={k}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    idx > 0 ? "border-t border-hairline" : ""
                  }`}
                >
                  <div className="skeleton mt-0.5 h-4 w-4 flex-shrink-0 rounded" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-44 rounded" />
                    <div className="skeleton h-3 w-32 rounded" />
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Retrieval tester. */}
          <div className="skeleton h-[420px] w-full rounded-[var(--radius-lg)]" />
        </div>
      </div>
    </div>
  );
}
