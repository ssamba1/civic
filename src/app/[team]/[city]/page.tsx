import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamTasksInteractive } from "@/components/teams/team-tasks-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";
import { isValidTeamId, TEAMS } from "@/lib/teams";

export const dynamicParams = true;

interface PageProps {
  params: Promise<{ team: string; city: string }>;
}

// DB first (provisioned cities), then the KNOWN_CITIES fallback (demo deploy).
async function resolveCity(
  citySlug: string,
): Promise<{ name: string; state: string } | null> {
  const db = await fetchCity(citySlug);
  if (db) return { name: db.name, state: db.state };
  const known = KNOWN_CITIES[citySlug];
  return known ? { name: known.name, state: known.state } : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all") {
    return { title: "Team not found | Civic" };
  }
  const resolved = await resolveCity(city);
  if (!resolved) return { title: "Team not found | Civic" };
  return {
    title: `Civic | ${TEAMS[team].shortLabel} — ${resolved.name} Tasks`,
    description: `${TEAMS[team].label} task queue for ${resolved.name}, ${resolved.state}.`,
  };
}

export default async function TeamTasksPage({ params }: PageProps) {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all") notFound();
  const resolved = await resolveCity(city);
  if (!resolved) notFound();

  const meta = TEAMS[team];

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-10 sm:px-6 lg:px-8">
        <section className="mb-8">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: meta.color,
                boxShadow: `0 0 6px ${meta.color}99`,
              }}
              aria-hidden="true"
            />
            {resolved.name}, {resolved.state} · {meta.shortLabel}
          </p>
          <h1 className="mt-2 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
            Tasks
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">{meta.duties}</p>
        </section>

        <TeamTasksInteractive teamId={team} />
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
