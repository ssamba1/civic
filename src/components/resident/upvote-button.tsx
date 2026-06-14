"use client";

import { ChevronUp } from "lucide-react";
import { useUpvotes } from "@/lib/upvotes";
import { cn } from "@/lib/utils/cn";

interface UpvoteButtonProps {
  reportId: string;
  severity?: number;
  /** Compact pill for dense list rows; default is the standard size. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Optimistic ▲ upvote for the resident community list. Count + active state
 * come from the client-only upvote store (src/lib/upvotes.ts); tapping toggles
 * instantly with no network round-trip.
 */
export function UpvoteButton({
  reportId,
  severity = 3,
  size = "md",
  className,
}: UpvoteButtonProps) {
  const { has, count, toggle } = useUpvotes();
  const active = has(reportId);
  const n = count(reportId, severity);

  return (
    <button
      type="button"
      onClick={(e) => {
        // List rows are often clickable (select/focus a report) — don't let the
        // upvote bubble up and trigger selection.
        e.stopPropagation();
        toggle(reportId);
      }}
      aria-pressed={active}
      aria-label={active ? "Remove upvote" : "Upvote this report"}
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-lg border transition-colors active:scale-90 motion-reduce:active:scale-100 motion-reduce:transition-none tabular-nums",
        size === "sm" ? "h-11 w-9 text-[11px]" : "h-12 w-10 text-xs",
        active
          ? "border-[#0a84ff]/40 bg-[#0a84ff]/15 text-[#0a84ff]"
          : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200",
        className,
      )}
    >
      <ChevronUp
        className={size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]"}
        strokeWidth={2.25}
        aria-hidden="true"
      />
      <span className="font-semibold leading-none">{n}</span>
    </button>
  );
}
