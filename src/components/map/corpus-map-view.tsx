"use client";

import { useMemo } from "react";

import { FullscreenMapOrchestrator } from "@/components/map/fullscreen-map";
import { useReportCorpus } from "@/lib/filters/context";
import type { TeamId } from "@/lib/teams";
import { getReportTeam } from "@/lib/teams-overrides";

interface CorpusMapViewProps {
  /** When set: lock + scope the map to this team. Omit for the all-teams city map. */
  teamId?: TeamId;
  center: [number, number];
  zoom: number;
  cityName: string;
  /** Resident community view: hide all gov dispatch affordances (see orchestrator). */
  readOnly?: boolean;
}

/**
 * Shared fullscreen map for both the city (all teams) and team (locked) views.
 * Reads the one shared, completion-resolved corpus so both maps draw from the
 * SAME dataset — all-teams is always a superset of any single team, and a task
 * marked done reads "closed" everywhere. `demo` reports are stripped because the
 * orchestrator re-merges the demo overlay itself (avoids double markers).
 */
export function CorpusMapView({
  teamId,
  center,
  zoom,
  cityName,
  readOnly,
}: CorpusMapViewProps) {
  const corpus = useReportCorpus();
  const reports = useMemo(() => {
    const base = corpus.filter((r) => !r.demo);
    return teamId ? base.filter((r) => getReportTeam(r) === teamId) : base;
  }, [corpus, teamId]);

  return (
    <FullscreenMapOrchestrator
      reports={reports}
      center={center}
      zoom={zoom}
      cityName={cityName}
      lockedTeam={teamId}
      readOnly={readOnly}
    />
  );
}
