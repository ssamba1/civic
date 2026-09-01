"use client";

import { ArrowRight, Check, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useRateReport, useReportRating } from "@/lib/resident-csat";
import { cn } from "@/lib/utils/cn";

/* ------------------------------------------------------------------
   Resident CSAT. One-tap "Was this fixed?" on a resolved report.

   The click IS the response (no form): it records the verdict locally and
   swaps to an acknowledgement. A "down" rating surfaces a light "we'll take
   another look" reassurance so a negative rating doesn't dead-end. Renders
   nothing until a report is actually resolved (gated by the caller).
   ------------------------------------------------------------------ */

export function ReportCsat({ reportId }: { reportId: string }) {
  const rating = useReportRating(reportId);
  const rate = useRateReport(reportId);

  if (rating) {
    const positive = rating === "up";
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className="flex items-center gap-2 text-[13px] text-subtle"
          role="status"
        >
          <span
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-full",
              positive
                ? "bg-[var(--color-success)]/15 text-[var(--status-success-fg)]"
                : "bg-[var(--color-warning)]/15 text-[var(--status-warning-fg)]",
            )}
            aria-hidden="true"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {positive
            ? "Thanks, glad we got it right."
            : "Thanks for the flag. We'll take another look."}
        </div>
        {/* Persistent next action so a resolved+rated report doesn't dead-end. */}
        <Link
          href="/report"
          className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-[var(--color-primary)] transition-colors hover:underline"
        >
          Report another issue
          <ArrowRight
            className="h-3.5 w-3.5"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[13px] font-medium text-subtle">
        Was this fixed?
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => rate("up")}
          aria-label="Yes, this was fixed"
          className="inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-[var(--color-success)]/40 hover:bg-[var(--color-success)]/10 hover:text-[var(--status-success-fg)] focus-visible:ring-2 focus-visible:ring-[var(--color-success)]/50"
        >
          <ThumbsUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Yes
        </button>
        <button
          type="button"
          onClick={() => rate("down")}
          aria-label="No, this was not fixed"
          className="inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 text-[13px] font-medium text-foreground outline-none transition-colors hover:border-[var(--color-warning)]/40 hover:bg-[var(--color-warning)]/10 hover:text-[var(--status-warning-fg)] focus-visible:ring-2 focus-visible:ring-[var(--color-warning)]/50"
        >
          <ThumbsDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          No
        </button>
      </div>
    </div>
  );
}
