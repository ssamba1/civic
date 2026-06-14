// Route-level loading skeleton for the staff inbox. Mirrors the inbox shape:
// header (title + refresh), four summary tiles, tab strip, then a ghost table
// with 9 columns and ~8 rows. Pulse-only — no layout animation.

// Stable keys for the fixed-shape skeleton placeholders. Mapping over named
// arrays (rather than Array.from + index) keeps React keys position-independent
// and avoids the noArrayIndexKey heuristic without per-line suppressions.
const TILE_KEYS = ["volume", "open", "dispatched", "resolved"];
const TAB_KEYS = [
  "all",
  "open",
  "dispatched",
  "progress",
  "closed",
  "rejected",
];
const HEADER_LABELS = [
  "Category",
  "Sev",
  "Address",
  "Submitted",
  "Est",
  "Materials",
  "Status",
  "Photo",
  "",
];
const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];
const CARD_KEYS = ["c1", "c2", "c3", "c4", "c5", "c6"];
// Per-column ghost-cell width + a stable key (no positional index in the key).
const GHOST_COLS = [
  { key: "category", width: "3.5rem" },
  { key: "sev", width: "3.5rem" },
  { key: "address", width: "10rem" },
  { key: "submitted", width: "3.5rem" },
  { key: "est", width: "3.5rem" },
  { key: "materials", width: "3.5rem" },
  { key: "status", width: "3.5rem" },
  { key: "photo", width: "3.5rem" },
  { key: "actions", width: "1.5rem" },
];

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
          {TILE_KEYS.map((k) => (
            <div
              key={k}
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
            {TAB_KEYS.map((k) => (
              <div
                key={k}
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
              {HEADER_LABELS.map((h) => (
                <th key={h || "actions"} className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_KEYS.map((rk) => (
              <tr
                key={rk}
                className="border-b border-zinc-100 dark:border-zinc-800/60"
              >
                {GHOST_COLS.map((col) => (
                  <td key={`${rk}-${col.key}`} className="px-4 py-4">
                    <div
                      className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
                      style={{ width: col.width }}
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
        {CARD_KEYS.map((k) => (
          <div
            key={k}
            className="h-24 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40"
          />
        ))}
      </div>
    </div>
  );
}
