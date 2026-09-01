/* Route-level skeleton, mirrors the contractor detail shell (profile card +
   four stat tiles + two-column cards) so the swap to real content has no
   geometry shift. Placeholders ride the shared `.skeleton` shimmer
   (theme-aware, reduced-motion safe). */

const TILE_KEYS = ["t1", "t2", "t3", "t4"];
const ROW_KEYS = ["r1", "r2", "r3", "r4"];

function CardSkeleton({ rows }: { rows: string[] }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="h-3 w-36 rounded skeleton" />
        <div className="h-3 w-8 rounded skeleton" />
      </div>
      <ul>
        {rows.map((k) => (
          <li
            key={k}
            className="border-b border-hairline px-4 py-3 last:border-b-0 sm:px-5"
          >
            <div className="h-3.5 w-3/4 rounded skeleton" />
            <div className="mt-2 h-2.5 w-1/2 rounded skeleton" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading contractor"
      className="flex flex-col min-h-dvh bg-background"
    >
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <div className="flex flex-col gap-4">
          {/* Profile header card. */}
          <section className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="h-3 w-24 rounded skeleton" />
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <div className="h-6 w-56 rounded skeleton" />
              <div className="h-5 w-14 rounded-full skeleton" />
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="h-3 w-28 rounded skeleton" />
              <div className="h-3 w-52 rounded skeleton" />
            </div>
          </section>

          {/* Stat tiles. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TILE_KEYS.map((k) => (
              <div
                key={k}
                className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5"
              >
                <div className="h-3 w-24 rounded skeleton" />
                <div className="mt-2 h-6 w-10 rounded skeleton" />
              </div>
            ))}
          </div>

          {/* Jobs + documents (left) · attributed reports (right). */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <CardSkeleton rows={ROW_KEYS.slice(0, 2)} />
              <CardSkeleton rows={ROW_KEYS.slice(0, 2)} />
            </div>
            <CardSkeleton rows={ROW_KEYS} />
          </div>
        </div>
      </div>
    </div>
  );
}
