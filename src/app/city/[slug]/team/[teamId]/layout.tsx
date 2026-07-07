import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { DashboardReport } from "@/lib/dashboard-data";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCorpus,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { DEMO_MODE } from "@/lib/demo-mode";
import { FilterProvider } from "@/lib/filters/context";
import { isValidTeamId } from "@/lib/teams";

/**
 * Team-scoped subtree of the canonical city console (loop-closure plan D1 —
 * the old /[team]/[city] tree collapsed into /city/[slug]/team/[teamId]).
 * Inherits the city chrome (CityHeader/CitySidebar) from the parent layout and
 * re-provides the filter context with the team LOCKED, so every reused surface
 * (tasks, analytics, map) only sees this team's reports.
 */
export default async function TeamScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  if (!isValidTeamId(teamId) || teamId === "all") notFound();

  // Same corpus resolution as the parent city layout — fetchCity/fetchCorpus
  // are request-cached, so this costs no extra queries.
  let corpus: DashboardReport[];
  if (DEMO_MODE && slug in KNOWN_CITIES) {
    corpus = getReportCorpus();
  } else {
    const city = await fetchCity(slug);
    if (!city) notFound();
    corpus = await fetchCorpus(
      city.id,
      city.active ? undefined : PREVIEW_SOURCES,
    );
  }

  return (
    <Suspense fallback={null}>
      <FilterProvider corpus={corpus} now={Date.now()} lockedTeam={teamId}>
        {children}
      </FilterProvider>
    </Suspense>
  );
}
