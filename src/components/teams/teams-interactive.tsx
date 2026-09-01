"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DelegationPanel } from "@/components/teams/delegation-panel";
import { RoutingChangesLog } from "@/components/teams/routing-changes-log";
import { RoutingMatrix } from "@/components/teams/routing-matrix";
import { TeamRoster } from "@/components/teams/team-roster";
import { WorkloadBars } from "@/components/teams/workload-bars";
import type { CityStats, DashboardReport } from "@/lib/dashboard-data";
import {
  useFilteredReports,
  useFilters,
  useReportCorpus,
} from "@/lib/filters/context";
import { filterReports } from "@/lib/filters/filter-reports";
import { isValidTeamId, type TeamId } from "@/lib/teams";
import { aggregateByTeam, sortTeamsByLoad } from "@/lib/teams-data";
import { getReportTeam, useTeamOverrides } from "@/lib/teams-overrides";

/* ==================================================================
   Teams orchestrator. Replaces DashboardInteractive on the city
   landing route.

   Selection model: roster / workload-bar clicks are LOCAL state only,
   not written to the shared filter context. This keeps the Teams view
   from polluting Analytics / Map scope when the user toggles between
   tabs. The shared FilterBar (separate UI) can still scope team
   globally via filter.team — that path still flows through.
   ================================================================== */

interface TeamsInteractiveProps {
  initialStats: CityStats;
}

const SELECTED_TEAM_STORAGE_KEY = "teams-selected-team";

export function TeamsInteractive({ initialStats }: TeamsInteractiveProps) {
  const { filter } = useFilters();
  const corpus = useReportCorpus();
  const globallyFiltered = useFilteredReports();
  const { overrides, history, setReportTeam, clearReportTeam } =
    useTeamOverrides();

  // Local-only highlight. Independent of filter.team so flipping to
  // Analytics doesn't drag this scope along. FilterBar can still drive
  // filter.team globally — surface it as initial selection so the two
  // views stay in sync when the user did set a global scope.
  const [selectedTeam, setSelectedTeam] = useState<TeamId>(filter.team);

  // Persist the local team highlight across navigation. Hydrate from
  // sessionStorage *after* mount (never in a useState initializer) so SSR and
  // the first client render agree; a saved selection wins over filter.team.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SELECTED_TEAM_STORAGE_KEY);
      if (saved && isValidTeamId(saved)) setSelectedTeam(saved);
    } catch {
      // sessionStorage unavailable — keep the filter-derived default.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SELECTED_TEAM_STORAGE_KEY, selectedTeam);
    } catch {
      // Storage write blocked (private mode / quota) — non-fatal.
    }
  }, [selectedTeam]);

  const handleSelectTeam = useCallback((teamId: TeamId) => {
    setSelectedTeam((prev) => (prev === teamId ? "all" : teamId));
  }, []);

  // Roster + workload bars always show all-team workload for context.
  // Ignore filter.team here (date / category / status / severity still
  // apply) so other teams' counts don't collapse to 0 when one team is
  // globally scoped via FilterBar.
  const rosterReports = useMemo<DashboardReport[]>(() => {
    if (filter.team === "all") return globallyFiltered;
    return filterReports(
      corpus,
      { ...filter, team: "all" },
      Date.now(),
      overrides,
    );
  }, [corpus, filter, globallyFiltered, overrides]);

  // Compute the per-team map once; DelegationPanel needs O(1) lookup by
  // team id (Map form), TeamRoster / WorkloadBars need the sorted array.
  // Single source of truth — no duplicate aggregation.
  const workloadMap = useMemo(
    () => aggregateByTeam(rosterReports, (r) => getReportTeam(r, overrides)),
    [rosterReports, overrides],
  );

  const workloads = useMemo(() => sortTeamsByLoad(workloadMap), [workloadMap]);

  // Delegation respects the LOCAL selection so the focused queue
  // narrows when the user clicks a card. Falls back to the
  // globally-filtered set when nothing is selected.
  const delegationReports = useMemo<DashboardReport[]>(() => {
    if (selectedTeam === "all") return globallyFiltered;
    return globallyFiltered.filter(
      (r) => getReportTeam(r, overrides) === selectedTeam,
    );
  }, [globallyFiltered, selectedTeam, overrides]);

  return (
    <div className="stagger-children flex flex-col gap-4">
      <section
        aria-label="City statistics"
        data-tour="city-stats"
        style={{ "--stagger-index": 0 } as React.CSSProperties}
      >
        <StatsCards stats={initialStats} />
      </section>

      <section
        aria-label="Team roster"
        data-tour="team-roster"
        style={{ "--stagger-index": 1 } as React.CSSProperties}
      >
        <TeamRoster
          workloads={workloads}
          selectedTeam={selectedTeam}
          onSelectTeam={handleSelectTeam}
        />
      </section>

      <div
        className="grid items-stretch gap-4 lg:grid-cols-2"
        style={{ "--stagger-index": 2 } as React.CSSProperties}
      >
        <WorkloadBars
          workloads={workloads}
          selectedTeam={selectedTeam}
          onSelectTeam={handleSelectTeam}
        />
        <div className="flex flex-col gap-4">
          <RoutingMatrix />
          <RoutingChangesLog />
        </div>
      </div>

      <div style={{ "--stagger-index": 3 } as React.CSSProperties}>
        <DelegationPanel
          reports={delegationReports}
          overrides={overrides}
          history={history}
          corpus={corpus}
          workloads={workloadMap}
          setReportTeam={setReportTeam}
          clearReportTeam={clearReportTeam}
        />
      </div>
    </div>
  );
}
