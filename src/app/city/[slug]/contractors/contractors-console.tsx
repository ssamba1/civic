"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { ContractorListRow } from "@/lib/db/contractors";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Contractors roster — deliberately a copy of the Members roster
   (members-table.tsx): same search box, same filter-chip row, same
   table shell, so the two workspace tabs read as one surface. Vendor
   counts are tens, so filtering is client-side over the server rows.
   ================================================================== */

interface ContractorsConsoleProps {
  slug: string;
  rows: ContractorListRow[];
  loadError: string | null;
}

type Filter = "all" | "active" | "inactive" | "warranty";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "warranty", label: "Live warranty" },
];

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Grayscale status badge — same fill-weight language as the members RoleBadge.
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-md)] border px-2 py-0.5 text-[11px] font-medium",
        active
          ? "border-hairline-strong bg-overlay-strong text-foreground"
          : "border-hairline bg-overlay text-faint",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function ContractorsConsole({
  slug,
  rows,
  loadError,
}: ContractorsConsoleProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const counts = useMemo(() => {
    const map: Record<Filter, number> = {
      all: rows.length,
      active: 0,
      inactive: 0,
      warranty: 0,
    };
    for (const r of rows) {
      if (r.active) map.active += 1;
      else map.inactive += 1;
      if (r.liveWarranties > 0) map.warranty += 1;
    }
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "active" && !r.active) return false;
      if (filter === "inactive" && r.active) return false;
      if (filter === "warranty" && r.liveWarranties === 0) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        (r.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, query]);

  if (loadError) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-foreground">
          Couldn't load contractors
        </p>
        <p className="mt-1.5 text-[13px] text-faint">
          Something went wrong fetching the vendor list ({loadError}). Refresh
          to try again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search — same control as the members roster. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="toolbar"
          aria-label="Filter contractors"
          aria-orientation="horizontal"
        >
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 h-8 text-[13px] font-medium",
                  "transition-colors duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "border-transparent bg-accent-soft text-accent-text"
                    : "border-hairline bg-overlay text-subtle hover:bg-overlay-strong hover:text-foreground",
                ].join(" ")}
              >
                {label}
                <span
                  className={[
                    "tabular-nums text-[11px]",
                    active ? "text-accent-text/70" : "text-faint",
                  ].join(" ")}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            strokeWidth={2}
            aria-hidden="true"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search contractors by name or email"
            className={[
              "h-8 w-full rounded-[var(--radius-md)] border border-hairline bg-surface pl-8 pr-2.5 text-[13px] text-foreground",
              "placeholder:text-faint outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            ].join(" ")}
          />
        </div>
      </div>

      {/* Roster table — same shell as members-table. */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-faint">
              <th scope="col" className="px-4 py-3 font-medium">
                Contractor
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Jobs
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Live warranties
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Next expiry
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Documents
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Attributed reports
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {rows.length === 0
                      ? "No contractors on file"
                      : "No contractors match"}
                  </p>
                  <p className="mt-1 text-[13px] text-faint">
                    {rows.length === 0
                      ? "Vendors appear here once a paving schedule or contract import creates them."
                      : "Try a different filter or clear the search."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-hairline last:border-b-0 transition-colors duration-150 hover:bg-overlay"
                >
                  <td className="px-4 py-3 align-middle">
                    <Link
                      href={`/city/${slug}/contractors/${r.id}`}
                      className="rounded-sm font-medium text-foreground underline-offset-2 outline-none transition-colors hover:text-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                    >
                      {r.name}
                    </Link>
                    <div className="text-[12px] text-faint">
                      {r.email ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <StatusBadge active={r.active} />
                  </td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                    {r.jobCount}
                  </td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                    {r.liveWarranties}
                  </td>
                  <td className="px-4 py-3 align-middle tabular-nums text-subtle">
                    {formatDate(r.nextExpiry)}
                  </td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                    {r.documentCount}
                  </td>
                  <td className="px-4 py-3 align-middle text-right tabular-nums text-foreground">
                    {r.liableReports}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
