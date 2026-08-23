"use client";

import { useMemo } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RoutingChangesLog } from "@/components/teams/routing-changes-log";
import { RoutingMatrix } from "@/components/teams/routing-matrix";
import { TeamTasksInteractive } from "@/components/teams/team-tasks-interactive";
import { WorkloadBars } from "@/components/teams/workload-bars";
import type { DashboardReport } from "@/lib/dashboard-data";
import { useReportCorpus, useServerNow } from "@/lib/filters/context";
import type { TeamId } from "@/lib/teams";
import { aggregateByTeam, computeTeamStats } from "@/lib/teams-data";
import { getReportTeam, useTeamOverrides } from "@/lib/teams-overrides";

/* ==================================================================
   Team dashboard — the city/admin Teams view, scoped to one team.

   Mounted under the team route's lockedTeam FilterProvider, so it reuses
   the city dashboard's sub-components (stats, workload, routing) but every
   panel reads only this team's reports. The multi-team roster grid is
   dropped — meaningless for a single team, and its data (totals, status
   mix, MTTR) is already carried by the stat cards + workload bar.

   Everything derives from `teamReports`, including the stat cards: a
   reassign elsewhere (routing matrix, map view) or a post-paint override
   rehydrate must move the cards in lockstep with the panels. `now` is the
   provider's server-seeded reference time so the week buckets match SSR.
   ================================================================== */

interface TeamDashboardInteractiveProps {
  teamId: TeamId;
}

export function TeamDashboardInteractive({
  teamId,
}: TeamDashboardInteractiveProps) {
  const corpus = useReportCorpus();
  const now = useServerNow();
  const { overrides } = useTeamOverrides();

  // This team's full backlog (all statuses, all time), override-resolved so a
  // reassignment immediately adds/removes a report from this team's view.
  const teamReports = useMemo<DashboardReport[]>(
    () => corpus.filter((r) => getReportTeam(r, overrides) === teamId),
    [corpus, teamId, overrides],
  );

  // Stat cards derive from the same set as every other panel — never frozen —
  // so Total/Open/Resolved/Avg track reassignments and override rehydration.
  const stats = useMemo(
    () => computeTeamStats(teamReports, now),
    [teamReports, now],
  );

  // aggregateByTeam keys by division, but teamReports holds only this team so
  // just its bucket is populated — WorkloadBars reads that one entry below.
  const workloadMap = useMemo(
    () => aggregateByTeam(teamReports, (r) => getReportTeam(r, overrides)),
    [teamReports, overrides],
  );

  const workloads = useMemo(() => {
    const w = workloadMap.get(teamId);
    return w ? [w] : [];
  }, [workloadMap, teamId]);

  return (
    <div className="stagger-children flex flex-col gap-4">
      <section
        aria-label="Team statistics"
        style={{ "--stagger-index": 0 } as React.CSSProperties}
      >
        <StatsCards stats={stats} />
      </section>

      <div
        className="grid items-stretch gap-4 lg:grid-cols-2"
        style={{ "--stagger-index": 1 } as React.CSSProperties}
      >
        <WorkloadBars
          workloads={workloads}
          selectedTeam={teamId}
          onSelectTeam={() => {}}
          selectable={false}
        />
        <div className="flex flex-col gap-4">
          <RoutingMatrix />
          <RoutingChangesLog />
        </div>
      </div>

      <section
        aria-label="Task queue"
        style={{ "--stagger-index": 2 } as React.CSSProperties}
      >
        <TeamTasksInteractive teamId={teamId} />
      </section>
    </div>
  );
}
