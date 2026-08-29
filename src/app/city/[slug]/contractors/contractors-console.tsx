"use client";

/**
 * Client console for the Contractors workspace list: text search, status and
 * warranty filters over the server-fetched rows (vendor counts are tens, so
 * filtering is client-side), each row linking into the detail page.
 * Utilitarian staff ops surface, same register as the Documents console.
 */
import { HardHat, Search } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { ContractorListRow } from "@/lib/db/contractors";

const EYEBROW =
  "font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint";
const FIELD =
  "h-8 rounded-md border border-hairline-strong bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60";

type StatusFilter = "all" | "active" | "inactive";
type WarrantyFilter = "all" | "live" | "none";

function formatDate(isoDate: string): string {
  const t = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return isoDate;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ContractorsConsole({
  slug,
  rows,
  loadError,
}: {
  slug: string;
  rows: ContractorListRow[];
  loadError: string | null;
}) {
  const searchId = useId();
  const statusId = useId();
  const warrantyId = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [warranty, setWarranty] = useState<WarrantyFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status === "active" && !row.active) return false;
      if (status === "inactive" && row.active) return false;
      if (warranty === "live" && row.liveWarranties === 0) return false;
      if (warranty === "none" && row.liveWarranties > 0) return false;
      if (
        q &&
        !row.name.toLowerCase().includes(q) &&
        !(row.email ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, query, status, warranty]);

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            strokeWidth={2}
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor={searchId}>
            Search contractors
          </label>
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            className={`${FIELD} w-full pl-7`}
          />
        </div>
        <label className="sr-only" htmlFor={statusId}>
          Status filter
        </label>
        <select
          id={statusId}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className={FIELD}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <label className="sr-only" htmlFor={warrantyId}>
          Warranty filter
        </label>
        <select
          id={warrantyId}
          value={warranty}
          onChange={(e) => setWarranty(e.target.value as WarrantyFilter)}
          className={FIELD}
        >
          <option value="all">Any warranty state</option>
          <option value="live">Live warranty</option>
          <option value="none">No live warranty</option>
        </select>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {loadError && (
        <p className="px-4 py-6 text-[13px] text-pastel-blush-strong">
          Contractor list failed to load: {loadError}
        </p>
      )}

      {!loadError && rows.length === 0 && (
        <div className="px-4 py-10 text-center">
          <HardHat
            className="mx-auto mb-2 h-5 w-5 text-faint"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[13px] text-subtle">
            No contractors on file. Vendors appear here once a paving schedule
            or contract import creates them.
          </p>
        </div>
      )}

      {!loadError && rows.length > 0 && filtered.length === 0 && (
        <p className="px-4 py-6 text-[13px] text-subtle">
          No contractors match the current filters.
        </p>
      )}

      {!loadError && filtered.length > 0 && (
        <ul>
          {filtered.map((row, idx) => (
            <li
              key={row.id}
              className={idx > 0 ? "border-t border-hairline" : ""}
            >
              <Link
                href={`/city/${slug}/contractors/${row.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-overlay"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                    <span className="truncate">{row.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider ${
                        row.active
                          ? "border-hairline-strong text-subtle"
                          : "border-hairline text-faint"
                      }`}
                    >
                      {row.active ? "Active" : "Inactive"}
                    </span>
                  </p>
                  {row.email && (
                    <p className="mt-0.5 truncate text-[12px] text-faint">
                      {row.email}
                    </p>
                  )}
                </div>
                <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-subtle">
                  <div className="flex items-baseline gap-1.5">
                    <dt className={EYEBROW}>Jobs</dt>
                    <dd className="tabular-nums">{row.jobCount}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className={EYEBROW}>Live warranties</dt>
                    <dd className="tabular-nums">{row.liveWarranties}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className={EYEBROW}>Docs</dt>
                    <dd className="tabular-nums">{row.documentCount}</dd>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dt className={EYEBROW}>Attributed reports</dt>
                    <dd className="tabular-nums">{row.liableReports}</dd>
                  </div>
                  {row.nextExpiry && (
                    <div className="flex items-baseline gap-1.5">
                      <dt className={EYEBROW}>Next expiry</dt>
                      <dd className="tabular-nums">
                        {formatDate(row.nextExpiry)}
                      </dd>
                    </div>
                  )}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
