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
    <div className="relative flex flex-col min-h-dvh bg-background">
      <div className="relative flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden="true"
            />
            {known.name}, {known.state} · {meta.shortLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Analytics
            </h1>
            <p className="text-[13px] text-faint">
              {meta.shortLabel} operational signal — resolution, backlog, and
              where it&apos;s happening.
            </p>
          </div>
        </section>

        <AnalyticsInteractive />
      </div>

      <footer className="border-t border-hairline mt-10 pb-safe">
        <div className="mx-auto flex max-w-[1800px] flex-col items-center justify-between gap-3 px-3 py-6 text-[13px] text-faint sm:flex-row sm:px-4 lg:px-6">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
