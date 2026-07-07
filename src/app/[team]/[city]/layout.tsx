import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TeamHeader } from "@/components/teams/team-header";
import { TeamSidebar } from "@/components/teams/team-sidebar";
import type { DashboardReport } from "@/lib/dashboard-data";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCorpus,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { DEMO_MODE } from "@/lib/demo-mode";
import { getDemoSession } from "@/lib/demo-session";
import { FilterProvider } from "@/lib/filters/context";
import { isValidTeamId, TEAM_LIST } from "@/lib/teams";

// Prerender every operational team × known city; provisioned cities render on
// demand (dynamicParams) with no redeploy.
export const dynamicParams = true;

export function generateStaticParams() {
  return TEAM_LIST.filter((t) => t.id !== "all").flatMap((t) =>
    Object.keys(KNOWN_CITIES).map((city) => ({ team: t.id, city })),
  );
}

export default async function TeamViewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ team: string; city: string }>;
}) {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all") notFound();

  // Demo deploy keeps the synthetic Cumming corpus; real deploy reads the city's
  // own reports from the DB per city_id (F1), preview-sourced when not yet live.
  let corpus: DashboardReport[];
  if (DEMO_MODE) {
    if (!(city in KNOWN_CITIES)) notFound();
    corpus = getReportCorpus();
  } else {
    const resolved = await fetchCity(city);
    if (!resolved) notFound();
    corpus = await fetchCorpus(
      resolved.id,
      resolved.active ? undefined : PREVIEW_SOURCES,
    );
  }

  const now = Date.now();
  const session = await getDemoSession();

  return (
    // Column on mobile (fixed TeamHeader on top); row on md+ where the
    // sticky TeamSidebar owns the left rail and flexbox owns content width.
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <TeamHeader
        team={team}
        city={city}
        accountLabel={session?.label ?? null}
      />
      <TeamSidebar
        team={team}
        city={city}
        accountLabel={session?.label ?? null}
      />

      <Suspense fallback={null}>
        <FilterProvider corpus={corpus} now={now} lockedTeam={team}>
          <main className="flex-1 flex flex-col min-w-0">{children}</main>
        </FilterProvider>
      </Suspense>
    </div>
  );
}
