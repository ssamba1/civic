"use client";

/* ==================================================================
   Public trending feed, renders pre-ranked reports without auth.

   Unlike TrendingFeed (which uses the upvote store + UpvoteButton
   for live interactivity), this is read-only: ranking is done server-
   side via rankTrending() so the page is fully static/RSC-compatible
   until it reaches this leaf. This component just handles display.
   ================================================================== */

import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { timeAgo } from "@/lib/utils/time-ago";

interface PublicTrendingProps {
  /** Pre-ranked reports (server has already applied rankTrending). */
  reports: DashboardReport[];
  emptyMessage?: string;
}

export function PublicTrending({
  reports,
  emptyMessage = "No open reports right now. The whole backlog is clear.",
}: PublicTrendingProps) {
  if (reports.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 text-center text-[14px] text-faint">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {reports.map((report, i) => {
        const meta = CATEGORY_META[report.category] ?? CATEGORY_META.other;
        return (
          <li
            key={report.id}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-hairline bg-surface p-3"
          >
            <span
              className="w-6 flex-shrink-0 text-center text-[15px] font-semibold tabular-nums text-faint"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-medium text-foreground">
                {meta.label}
              </span>
              <span className="truncate text-[12px] text-subtle">
                {report.address} · {timeAgo(report.created_at)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
