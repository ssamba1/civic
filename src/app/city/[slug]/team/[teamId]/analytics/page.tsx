import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsInteractive } from "@/components/analytics/analytics-interactive";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";
import { isValidTeamId, TEAMS } from "@/lib/teams";

interface PageProps {
  params: Promise<{ slug: string; teamId: string }>;
}

async function resolveCity(
  slug: string,
): Promise<{ name: string; state: string } | null> {
  const db = await fetchCity(slug);
  if (db) return { name: db.name, state: db.state };
  const known = KNOWN_CITIES[slug];
  return known ? { name: known.name, state: known.state } : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, teamId } = await params;
  if (!isValidTeamId(teamId) || teamId === "all") {
    return { title: "Team not found | Civic" };
  }
  const resolved = await resolveCity(slug);
  if (!resolved) return { title: "Team not found | Civic" };
  return {
    title: `Civic | ${TEAMS[teamId].shortLabel}, ${resolved.name} Analytics`,
    description: `Operational analytics for ${TEAMS[teamId].label} in ${resolved.name}, ${resolved.state}.`,
  };
}

export default async function TeamAnalyticsPage({ params }: PageProps) {
  const { slug, teamId } = await params;
  if (!isValidTeamId(teamId) || teamId === "all") notFound();
  const resolved = await resolveCity(slug);
  if (!resolved) notFound();

  const meta = TEAMS[teamId];

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
            {resolved.name}, {resolved.state} · {meta.shortLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Analytics
            </h1>
            <p className="text-[13px] text-faint">
              {meta.shortLabel} operational signal, resolution, backlog, and
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
