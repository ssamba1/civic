import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TeamHeader } from "@/components/teams/team-header";
import { TeamSidebar } from "@/components/teams/team-sidebar";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import { getDemoSession } from "@/lib/demo-session";
import { FilterProvider } from "@/lib/filters/context";
import { isValidTeamId, TEAM_LIST } from "@/lib/teams";

// Prerender every operational team × known city, mirroring the city view's
// generateStaticParams. The "all" admin pseudo-team has no team view.
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
  if (!isValidTeamId(team) || team === "all" || !(city in KNOWN_CITIES)) {
    notFound();
  }

  const corpus = getReportCorpus();
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
