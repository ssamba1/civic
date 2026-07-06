import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamDashboardInteractive } from "@/components/teams/team-dashboard-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { isValidTeamId, TEAMS } from "@/lib/teams";

interface PageProps {
  params: Promise<{ team: string; city: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all" || !(city in KNOWN_CITIES)) {
    return { title: "Team not found | Civic" };
  }
  const known = KNOWN_CITIES[city];
  return {
    title: `Civic | ${TEAMS[team].shortLabel} — ${known.name} Overview`,
    description: `Workload, routing, and queue depth for ${TEAMS[team].label} in ${known.name}, ${known.state}.`,
  };
}

export default async function TeamOverviewPage({ params }: PageProps) {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all" || !(city in KNOWN_CITIES)) {
    notFound();
  }

  const meta = TEAMS[team];
  const known = KNOWN_CITIES[city];

  // Stats and every panel derive client-side from the team-locked corpus
  // (see TeamDashboardInteractive) so reassignments move them in lockstep —
  // no server-computed snapshot to desync, and no server-side call into the
  // client-only category-override resolver.
  return (
    <div className="flex flex-col min-h-dvh">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-10 sm:px-6 lg:px-8">
        <section className="mb-5">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            <span
              className="h-1.5 w-1.5 rounded-full bg-faint"
              aria-hidden="true"
            />
            {known.name}, {known.state} · {meta.shortLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Overview
            </h1>
            <p className="max-w-2xl text-[13px] text-faint">{meta.duties}</p>
          </div>
        </section>

        <TeamDashboardInteractive teamId={team} />
      </div>

      <footer className="border-t border-hairline mt-10 pb-safe">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-faint sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
