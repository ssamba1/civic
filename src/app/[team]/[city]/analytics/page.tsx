import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";
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
    title: `Civic | ${TEAMS[team].shortLabel} — ${known.name} Analytics`,
    description: `Operational analytics for ${TEAMS[team].label} in ${known.name}, ${known.state}.`,
  };
}

export default async function TeamAnalyticsPage({ params }: PageProps) {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all" || !(city in KNOWN_CITIES)) {
    notFound();
  }

  const meta = TEAMS[team];
  const known = KNOWN_CITIES[city];

  return (
    <div className="relative flex flex-col min-h-dvh bg-black">
      <div className="relative flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-10 sm:px-6 lg:px-8">
        <section className="mb-6 sm:mb-8">
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
            Analytics
          </h1>
          <p className="mt-2 sm:mt-3 text-sm text-zinc-400">
            {meta.shortLabel} operational signal — resolution, backlog, and
            where it&apos;s happening.
          </p>
        </section>

        <AnalyticsInteractive />
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
