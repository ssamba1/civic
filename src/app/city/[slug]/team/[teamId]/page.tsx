import { Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamCrewsSection } from "@/components/crews/team-crews-section";
import { TeamDashboardInteractive } from "@/components/teams/team-dashboard-interactive";
import { type CrewTypeDef, DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";
import { fetchCityCrewTypes } from "@/lib/db/crew-types";
import { type CrewWorkload, fetchCrewWorkloads } from "@/lib/db/crew-workloads";
import { type CrewRow, fetchCityCrews } from "@/lib/db/crews";
import { getStaffAccessForCity } from "@/lib/staff-access";
import { isValidTeamId, TEAMS } from "@/lib/teams";

// The crew breakdown below is staff-gated and names staff on each crew, so the
// route reads cookies per request and must never be prerendered or cached.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; teamId: string }>;
}

// DB first (provisioned cities), then the KNOWN_CITIES fallback (demo deploy).
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
    title: `Civic | ${TEAMS[teamId].shortLabel}, ${resolved.name} Overview`,
    description: `Workload, routing, and queue depth for ${TEAMS[teamId].label} in ${resolved.name}, ${resolved.state}.`,
  };
}

export default async function TeamOverviewPage({ params }: PageProps) {
  const { slug, teamId } = await params;
  if (!isValidTeamId(teamId) || teamId === "all") notFound();
  const resolved = await resolveCity(slug);
  if (!resolved) notFound();

  const meta = TEAMS[teamId];

  // Staff-gated crew breakdown. Logged-out / non-staff visitors see nothing.
  // fetchCity is React-cached, so this shares resolveCity's query. The only
  // extra cost is the id it needs (resolveCity discards it). Synthetic
  // KNOWN_CITIES slugs have no DB row, so there are no crews to show.
  const access = await getStaffAccessForCity(slug);
  const dbCity = await fetchCity(slug);

  let teamCrews: CrewRow[] = [];
  let crewWorkloads: Record<string, CrewWorkload> = {};
  let crewTypes: CrewTypeDef[] = DEFAULT_CREW_TYPES;

  if (access !== null && dbCity) {
    const [crewsResult, workloadsResult, typesResult] = await Promise.all([
      fetchCityCrews(dbCity.id),
      fetchCrewWorkloads(dbCity.id),
      fetchCityCrewTypes(dbCity.id),
    ]);
    teamCrews = crewsResult.ok
      ? crewsResult.crews.filter((c) => c.teamKey === teamId)
      : [];
    crewWorkloads = workloadsResult.ok ? workloadsResult.workloads : {};
    // Mirror the members page: honor a catalog where every row is deactivated
    // (empty select), only fall back to the built-in defaults when the city has
    // no catalog at all (pre-031 DB or a city created after the seed).
    const typeRows = typesResult.ok ? typesResult.types : [];
    crewTypes =
      typesResult.ok && typeRows.length > 0
        ? typeRows
            .filter((t) => t.active)
            .map(({ key, label, description }) => ({ key, label, description }))
        : DEFAULT_CREW_TYPES;
  }

  // Stats and every panel derive client-side from the team-locked corpus
  // (see TeamDashboardInteractive) so reassignments move them in lockstep,
  // no server-computed snapshot to desync, and no server-side call into the
  // client-only category-override resolver.
  return (
    <div className="flex flex-col min-h-dvh">
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            <span
              className="h-1.5 w-1.5 rounded-full bg-faint"
              aria-hidden="true"
            />
            {resolved.name}, {resolved.state} · {meta.shortLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">
              Overview
            </h1>
            <p className="max-w-2xl text-[13px] text-faint">{meta.duties}</p>
            <Link
              href={`/city/${slug}/team/${teamId}/field`}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline px-2.5 py-1 text-[13px] font-medium text-foreground hover:bg-overlay"
            >
              <Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} />
              Field view
            </Link>
          </div>
        </section>

        <TeamDashboardInteractive teamId={teamId} />

        {access !== null && (
          <TeamCrewsSection
            crews={teamCrews}
            workloads={crewWorkloads}
            slug={slug}
            crewTypes={crewTypes}
          />
        )}
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
