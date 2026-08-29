"use client";

import { Clock, HardHat, Pencil, Star, Timer } from "lucide-react";
import Link from "next/link";
import {
  formatDays,
  STATUS_COLORS,
  StatusMiniBar,
} from "@/components/teams/status-mini-bar";
import { isPortalCrewType } from "@/lib/crew-portal";
import type { CrewTypeDef } from "@/lib/crew-types";
import type { CrewWorkload } from "@/lib/db/crew-workloads";
import type { CrewRow } from "@/lib/db/crews";
import { isValidTeamId, TEAMS } from "@/lib/teams";

/* ==================================================================
   Crew stat card — a crew's roster plus its work-order workload. Mirrors
   the team card (status mini-bar, oldest-open age, MTTR) but without the
   scope-toggle interaction: a crew card is a plain surface. Rendered by
   crews-panel, grouped under its division.
   ================================================================== */

function teamColor(teamKey: string): string {
  return isValidTeamId(teamKey) ? TEAMS[teamKey].color : "#91919b";
}

/** Catalog label for a type key; orphan keys (deleted catalog row) fall back
 *  to a humanized raw key so the crew still renders honestly. */
function typeLabel(key: string, crewTypes: CrewTypeDef[]): string {
  return crewTypes.find((t) => t.key === key)?.label ?? key.replace(/_/g, " ");
}

export function CrewStatCard({
  crew,
  workload,
  slug,
  crewTypes,
  onEdit,
}: {
  crew: CrewRow;
  workload?: CrewWorkload;
  slug: string;
  crewTypes: CrewTypeDef[];
  onEdit?: () => void;
}) {
  const color = teamColor(crew.teamKey);
  const byStatus = workload?.byStatus;
  const open = byStatus?.open ?? 0;
  const dispatched = byStatus?.dispatched ?? 0;
  const in_progress = byStatus?.in_progress ?? 0;
  const closed = byStatus?.closed ?? 0;

  const oldestLabel =
    workload && workload.oldestOpenAgeDays !== null
      ? formatDays(workload.oldestOpenAgeDays)
      : "—";
  const mttrLabel =
    workload && workload.mttrHours !== null ? `${workload.mttrHours}h` : "—";

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-hairline bg-surface p-4 shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
            style={{ background: `${color}1a`, color }}
          >
            <HardHat className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          {crew.crewType && isPortalCrewType(crew.crewType) ? (
            <Link
              href={`/city/${slug}/crew/${crew.crewType}/analytics?crew=${encodeURIComponent(crew.name)}`}
              aria-label={`View ${crew.name} analytics`}
              className="truncate rounded-sm text-[14px] font-medium text-foreground underline-offset-2 outline-none transition-colors duration-150 hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {crew.name}
            </Link>
          ) : (
            <span className="truncate text-[14px] font-medium text-foreground">
              {crew.name}
            </span>
          )}
          {!crew.active && (
            <span className="flex-shrink-0 rounded-md border border-hairline bg-overlay px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">
              Inactive
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-[24px] font-semibold tracking-tight text-foreground tabular-nums leading-none">
            {workload?.total ?? 0}
          </span>
          {onEdit && (
            <button
              type="button"
              aria-label={`Edit ${crew.name}`}
              onClick={onEdit}
              className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-faint outline-none transition-colors duration-150 hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      <StatusMiniBar
        segments={[
          { value: open, color: STATUS_COLORS.open, label: "open" },
          {
            value: dispatched,
            color: STATUS_COLORS.dispatched,
            label: "dispatched",
          },
          {
            value: in_progress,
            color: STATUS_COLORS.in_progress,
            label: "in progress",
          },
          { value: closed, color: STATUS_COLORS.closed, label: "closed" },
        ]}
      />

      <footer className="flex items-center justify-between gap-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" strokeWidth={1.75} />
          oldest {oldestLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3 w-3" strokeWidth={1.75} />
          MTTR {mttrLabel}
        </span>
      </footer>

      {crew.crewType && (
        <span
          className="w-fit rounded-md border border-hairline bg-overlay px-1.5 py-0.5 text-[11px] font-medium text-subtle"
          title={crewTypes.find((t) => t.key === crew.crewType)?.description}
        >
          {typeLabel(crew.crewType, crewTypes)}
        </span>
      )}
      <div className="text-[12px] leading-relaxed text-faint">
        {crew.members.length === 0
          ? "No members yet — work can still route here"
          : crew.members.map((m, i) => (
              <span key={m.userId}>
                {i > 0 && ", "}
                <span
                  className={m.isLead ? "font-medium text-subtle" : undefined}
                >
                  {m.displayName ?? "Unnamed"}
                  {m.isLead && (
                    <Star
                      className="ml-0.5 inline h-3 w-3 -translate-y-px"
                      strokeWidth={2}
                      aria-label="Crew lead"
                    />
                  )}
                </span>
              </span>
            ))}
      </div>
    </div>
  );
}
