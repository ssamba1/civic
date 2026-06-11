// Route-level loading skeleton for the staff inbox. Mirrors the inbox shape:
// header (title + refresh), four summary tiles, tab strip, then a ghost table
// with 9 columns and ~8 rows. Pulse-only — no layout animation.
export default function StaffInboxLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-200 bg-white px-4 py-3 md:px-6 md:py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-4 w-28 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>

        {/* Summary tiles */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40"
            >
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-2 h-7 w-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-2 h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-700/60" />
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-20 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700"
              />
            ))}
          </div>
          <div className="h-9 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 sm:w-72" />
        </div>
      </div>

      {/* Ghost table */}
      <div className="hidden flex-1 overflow-auto md:block">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
              {["Category", "Sev", "Address", "Submitted", "Est", "Materials", "Status", "Photo", ""].map(
                (h, i) => (
                  <th key={i} className="px-4 py-3">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, r) => (
              <tr key={r} className="border-b border-zinc-100 dark:border-zinc-800/60">
                {Array.from({ length: 9 }).map((_, c) => (
                  <td key={c} className="px-4 py-4">
                    <div
                      className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
                      style={{ width: c === 2 ? "10rem" : c === 8 ? "1.5rem" : "3.5rem" }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile ghost cards */}
      <div className="flex-1 space-y-2 overflow-auto p-3 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40"
          />
        ))}
      </div>
    </div>
  );
}
