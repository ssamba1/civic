/* Route-level skeleton for the Work Order Grid. The grid page is staff-gated
   and fetches rows + crews + crew types before it can render anything, and the
   AG Grid bundle is the largest chunk on any route, so without this the
   content area stayed blank for the whole wait. Mirrors the real shell exactly:
   full-bleed, the same h-[calc(100dvh/var(--app-zoom,1))] height (dvh resolves
   BEFORE the html zoom scales it), the same mobile fixed-header offset, and a
   toolbar + header-row + rows silhouette at AG Grid's own row rhythm.
   Placeholders ride the shared `.skeleton` shimmer (theme-aware,
   reduced-motion safe via globals.css). */

/* Width class per column. Four columns share "w-[12%]", so the class string
   cannot be the React key, that produced "Encountered two children with the
   same key" on every render of this skeleton. The list is a fixed constant that
   is never reordered or filtered, so the index IS the stable identity. */
const COLUMNS = [
  { id: "category", w: "w-[16%]" },
  { id: "address", w: "w-[22%]" },
  { id: "status", w: "w-[12%]" },
  { id: "severity", w: "w-[12%]" },
  { id: "team", w: "w-[14%]" },
  { id: "cost", w: "w-[12%]" },
  { id: "due", w: "w-[12%]" },
];

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading work order grid"
      className="flex h-[calc(100dvh/var(--app-zoom,1))] w-full flex-col overflow-hidden pt-[calc(env(safe-area-inset-top)+8rem)] md:pt-0"
    >
      <h1 className="sr-only">Work Order Grid</h1>

      {/* Toolbar strip. */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="skeleton h-8 w-56 rounded-[var(--radius-md)]" />
          <div className="skeleton h-8 w-32 rounded-[var(--radius-md)]" />
          <div className="skeleton h-8 w-32 rounded-[var(--radius-md)]" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-8 w-24 rounded-[var(--radius-md)]" />
          <div className="skeleton h-8 w-8 rounded-[var(--radius-md)]" />
        </div>
      </div>

      {/* Grid body, header row then data rows at a fixed rhythm. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-shrink-0 items-center gap-4 border-b border-hairline bg-overlay/50 px-4 py-3">
          {COLUMNS.map((col) => (
            <div key={col.id} className={`skeleton h-3 rounded ${col.w}`} />
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: 26 }, (_, i) => `row-${i}`).map((key) => (
            <div
              key={key}
              className="flex items-center gap-4 border-b border-hairline px-4 py-[13px]"
            >
              {COLUMNS.map((col) => (
                <div key={col.id} className={`skeleton h-3 rounded ${col.w}`} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pagination bar. */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-hairline px-4 py-2.5">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="flex items-center gap-2">
          <div className="skeleton h-7 w-7 rounded-[var(--radius-md)]" />
          <div className="skeleton h-7 w-7 rounded-[var(--radius-md)]" />
        </div>
      </div>
    </div>
  );
}
