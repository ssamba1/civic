"use client";

import { ArrowRight, History } from "lucide-react";
import { memo, useMemo } from "react";
import { Tile } from "@/components/analytics/bento-primitives";
import { useCategoryOverrides } from "@/lib/category-overrides";
import { categoryMeta } from "@/lib/dashboard-data";
import { TEAMS } from "@/lib/teams";
import { useTeamOverrides } from "@/lib/teams-overrides";
import { timeAgo } from "@/lib/utils/time-ago";

/* ==================================================================
   Routing activity feed. Sits under the Default routing matrix and
   gives the dispatcher a timestamped memory of what they re-routed.
   Both category-level re-routes (from the matrix directly above) and
   per-report reassignments (from the delegation panel below).

   Both sources persist a `{ from, to, ts }` history; this component
   merges them, sorts most-recent-first, and renders a read-only feed.
   Revert lives at the source (matrix RotateCcw, delegation panel), so
   this stays a pure audit surface, no duplicated mutation logic.
   ================================================================== */

const MAX_ROWS = 7;

interface FeedEntry {
  id: string;
  subject: string;
  badge: "category" | "report";
  from: string;
  to: string;
  ts: string;
}

function RoutingChangesLogInner() {
  const { history: categoryHistory } = useCategoryOverrides();
  const { history: reportHistory } = useTeamOverrides();

  const entries = useMemo<FeedEntry[]>(() => {
    const out: FeedEntry[] = [];

    for (const events of Object.values(categoryHistory)) {
      for (const e of events) {
        const meta = categoryMeta(e.category);
        out.push({
          id: `c-${e.category}-${e.ts}`,
          subject: meta?.label ?? e.category,
          badge: "category",
          from: e.from,
          to: e.to,
          ts: e.ts,
        });
      }
    }

    for (const [reportId, events] of Object.entries(reportHistory)) {
      for (const e of events) {
        out.push({
          id: `r-${reportId}-${e.ts}`,
          subject: `#${reportId}`,
          badge: "report",
          from: e.from,
          to: e.to,
          ts: e.ts,
        });
      }
    }

    return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }, [categoryHistory, reportHistory]);

  const shown = entries.slice(0, MAX_ROWS);
  const overflow = entries.length - shown.length;

  return (
    <Tile
      title="Routing activity"
      subtitle={
        entries.length > 0
          ? `${entries.length} change${entries.length === 1 ? "" : "s"}`
          : undefined
      }
      className="flex-1"
    >
      {entries.length === 0 ? (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-overlay text-faint">
            <History className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-[13px] font-medium text-subtle">
            No routing changes yet
          </p>
          <p className="max-w-[34ch] text-[12px] leading-snug text-faint">
            Re-route a category above or reassign a report. Every change shows
            up here with a timestamp.
          </p>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <ul className="flex flex-col">
            {shown.map((e) => {
              const fromTeam = TEAMS[e.from as keyof typeof TEAMS];
              const toTeam = TEAMS[e.to as keyof typeof TEAMS];
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 border-b border-hairline py-2.5 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full bg-faint"
                        aria-hidden
                      />
                      <span className="truncate">{e.subject}</span>
                      {e.badge === "report" && (
                        <span className="flex-shrink-0 rounded-sm bg-overlay-strong px-1 text-[9px] uppercase tracking-wider text-faint">
                          report
                        </span>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-[11px] tabular-nums text-faint">
                      {timeAgo(e.ts)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-4 text-[11px] text-faint">
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ background: fromTeam?.color ?? "#737373" }}
                        aria-hidden
                      />
                      <span className="truncate">
                        {fromTeam?.shortLabel ?? e.from}
                      </span>
                    </span>
                    <ArrowRight
                      className="h-3 w-3 flex-shrink-0 text-faint"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="inline-flex min-w-0 items-center gap-1 text-subtle">
                      <span
                        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ background: toTeam?.color ?? "#737373" }}
                        aria-hidden
                      />
                      <span className="truncate">
                        {toTeam?.shortLabel ?? e.to}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {overflow > 0 && (
            <p className="mt-auto pt-2 text-[11px] text-faint">
              +{overflow} earlier change{overflow === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </Tile>
  );
}

export const RoutingChangesLog = memo(RoutingChangesLogInner);
