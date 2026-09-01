"use client";

import {
  Activity,
  ClipboardList,
  Copy,
  FileText,
  type LucideIcon,
  RefreshCw,
  Send,
  Sparkles,
  Tag,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   Member activity timeline, the one interactive island on the member
   detail page. The server component does the report/event merge, label
   humanization, and relative-time formatting (so timestamps match the
   request render and never hydrate-mismatch); this component only maps
   the serializable `iconKind` back to a glyph and gates the list length
   behind a "Show all" toggle.
   ================================================================== */

// Normalized event-kind → glyph. The server collapses raw event_type values
// into this small fixed set (see iconKind() in member-detail) so the boundary
// stays serializable. Lucide components can't cross server→client.
const KIND_ICON: Record<string, LucideIcon> = {
  report: FileText,
  status: RefreshCw,
  classification_overridden: Tag,
  ai_classified: Sparkles,
  classification_failed: TriangleAlert,
  work_order_created: ClipboardList,
  dispatched: Send,
  resolved: Wrench,
  duplicate_detected: Copy,
  generic: Activity,
};

export interface TimelineEntry {
  key: string;
  iconKind: string;
  label: string;
  note: string | null;
  timeLabel: string;
  href: string | null;
}

// Collapsed height before the toggle appears.
const INITIAL_COUNT = 30;

export function MemberActivityTimeline({
  entries,
}: {
  entries: TimelineEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <p className="text-[13px] text-faint">No activity yet</p>
      </div>
    );
  }

  const shown = expanded ? entries : entries.slice(0, INITIAL_COUNT);
  const hasMore = entries.length > INITIAL_COUNT;

  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col">
        {shown.map((entry, i) => {
          const Icon = KIND_ICON[entry.iconKind] ?? Activity;
          const isLast = i === shown.length - 1;
          return (
            <li
              key={entry.key}
              style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
              className="relative flex gap-3 pb-5 last:pb-0 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none"
            >
              {/* Connector line behind the node. Stops at the last visible node. */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute left-4 top-8 bottom-0 w-px bg-hairline"
                />
              )}
              {/* Node. */}
              <span
                aria-hidden="true"
                className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-overlay text-subtle"
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              {/* Label + time + optional note. */}
              <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                {entry.href ? (
                  <Link
                    href={entry.href}
                    className="text-[14px] font-medium leading-tight text-foreground transition-colors hover:text-accent-text focus-visible:outline-none focus-visible:underline"
                  >
                    {entry.label}
                  </Link>
                ) : (
                  <span className="text-[14px] font-medium leading-tight text-foreground">
                    {entry.label}
                  </span>
                )}
                <span className="text-[12px] tabular-nums leading-tight text-faint">
                  {entry.timeLabel}
                </span>
                {entry.note && (
                  <span className="mt-1 text-[12px] leading-relaxed text-subtle">
                    {entry.note}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            "self-start rounded-[var(--radius-md)] border border-hairline bg-overlay px-3 h-8 text-[13px] font-medium text-subtle",
            "transition-colors hover:bg-overlay-strong hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          )}
        >
          {expanded ? "Show less" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}
