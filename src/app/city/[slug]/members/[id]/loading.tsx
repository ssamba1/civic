/* Route-level skeleton, mirrors the member detail shell (back link + profile
   header + stat tiles + activity timeline / reports table columns) so the swap
   to real content has no geometry shift. Placeholders ride the shared
   `.skeleton` shimmer (theme-aware, reduced-motion safe). */

const TILE_KEYS = ["s1", "s2", "s3", "s4"];
const TIMELINE_KEYS = ["t1", "t2", "t3", "t4", "t5", "t6"];
const REPORT_KEYS = ["p1", "p2", "p3", "p4", "p5", "p6"];

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading member profile"
      className="relative flex flex-col min-h-dvh bg-background"
    >
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        {/* Back link placeholder. */}
        <div className="mb-4 h-4 w-24 rounded skeleton" />

        {/* Profile header. */}
        <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {/* Name + role badge. */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="h-7 w-48 rounded skeleton" />
                <div className="h-5 w-16 rounded-[var(--radius-md)] skeleton" />
              </div>
              {/* Team · email · phone. */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                <div className="h-4 w-32 rounded skeleton" />
                <div className="h-4 w-40 rounded skeleton" />
                <div className="h-4 w-28 rounded skeleton" />
              </div>
            </div>
            {/* Joined · last sign-in. */}
            <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-1.5 sm:flex-col sm:items-end">
              <div className="h-3 w-28 rounded skeleton" />
              <div className="h-3 w-32 rounded skeleton" />
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
              <div className="h-3 w-24 rounded skeleton" />
              <div className="mt-3 h-7 w-12 rounded skeleton" />
            </div>
          ))}
        </div>

        {/* Activity timeline (left) + reports table (right). */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)]">
          {/* Activity, timeline nodes + connector rail. */}
          <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="mb-4 h-3.5 w-16 rounded skeleton" />
            <ol className="relative flex flex-col">
              {TIMELINE_KEYS.map((k, i) => {
                const isLast = i === TIMELINE_KEYS.length - 1;
                return (
                  <li key={k} className="relative flex gap-3 pb-5 last:pb-0">
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-4 top-8 w-px bg-hairline"
                      />
                    )}
                    <div className="h-8 w-8 shrink-0 rounded-full skeleton" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                      <div className="h-3.5 w-40 rounded skeleton" />
                      <div className="h-2.5 w-20 rounded skeleton" />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Reports, unpadded card, bordered title header + table rows. */}
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
              <div className="h-3.5 w-16 rounded skeleton" />
              <div className="h-3 w-6 rounded skeleton" />
            </div>
            {REPORT_KEYS.map((k) => (
              <div
                key={k}
                className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-b-0 sm:px-5"
              >
                {/* Category. */}
                <div className="h-3.5 w-32 flex-1 rounded skeleton" />
                {/* Status chip. */}
                <div className="h-5 w-16 shrink-0 rounded-[var(--radius-md)] skeleton" />
                {/* Address. */}
                <div className="hidden h-3 w-28 shrink-0 rounded skeleton sm:block" />
                {/* Filed. */}
                <div className="h-3 w-14 shrink-0 rounded skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
