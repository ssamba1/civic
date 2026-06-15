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
    description: `Workload, delegation, and queue depth for ${TEAMS[team].label} in ${known.name}, ${known.state}.`,
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
        <section className="mb-6">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: meta.color,
                boxShadow: `0 0 6px ${meta.color}99`,
              }}
              aria-hidden="true"
            />
            {known.name}, {known.state} · {meta.shortLabel}
          </p>
          <h1 className="mt-2 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
            Overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">{meta.duties}</p>
        </section>

        <TeamDashboardInteractive teamId={team} />
      </div>

      <footer className="border-t border-white/[0.06] mt-10 pb-safe">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-zinc-500 sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
