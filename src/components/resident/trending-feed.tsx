"use client";

import { useMemo } from "react";
import type { DashboardReport } from "@/lib/dashboard-data";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { useUpvotes } from "@/lib/upvotes";
import { timeAgo } from "@/lib/utils/time-ago";
import { UpvoteButton } from "./upvote-button";

/* ==================================================================
   Trending demand feed (NEXT_100 #86).

   The upvote infrastructure already existed (src/lib/upvotes.ts + the
   report_upvote_counts RPC) but nothing surfaced reports RANKED by demand.
   This is the accountability lever: the issues neighbours care about most,
   sorted to the top, in public. Ranking uses the same useUpvotes count the
   buttons show, so the order matches the numbers a resident sees.
   ================================================================== */

interface TrendingFeedProps {
  reports: DashboardReport[];
  limit?: number;
}

export function TrendingFeed({ reports, limit = 25 }: TrendingFeedProps) {
  const { count } = useUpvotes();

  // Re-derives whenever the upvote store version changes (count() registers
  // live-count fetches and re-renders on arrival), so the ranking self-heals
  // from the deterministic demo base to real counts on a live deploy.
  const ranked = useMemo(
    () =>
      [...reports]
        .map((r) => ({ report: r, votes: count(r.id, r.severity) }))
        .sort(
          (a, b) =>
            b.votes - a.votes ||
            Date.parse(b.report.created_at) - Date.parse(a.report.created_at),
        )
        .slice(0, limit),
    [reports, count, limit],
  );

  if (ranked.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 text-center text-[14px] text-faint">
        No open reports right now. The whole backlog is clear.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {ranked.map(({ report }, i) => {
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
            <div className="ml-auto flex-shrink-0">
              <UpvoteButton
                reportId={report.id}
                severity={report.severity}
                size="sm"
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
