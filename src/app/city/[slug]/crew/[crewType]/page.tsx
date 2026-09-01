import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrewPortalHeader } from "@/components/crews/crew-portal-header";
import { TeamsInteractive } from "@/components/teams/teams-interactive";
import {
  categoriesForCrewType,
  isPortalCrewType,
  portalLabel,
} from "@/lib/crew-portal";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import {
  fetchCity as fetchCityFromDb,
  fetchCityStats,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { fetchCityCrews } from "@/lib/db/crews";
import type { City } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string; crewType: string }>;
  searchParams: Promise<{ crew?: string }>;
}

// DB first (provisioned cities), then the mock fallback (demo deploy), same
// resolution order as the city overview page (src/app/city/[slug]/page.tsx).
async function resolveCity(slug: string): Promise<City | null> {
  let city: City | null = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  return city;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) {
    return { title: "Crew not found | Civic" };
  }
  const city = await resolveCity(slug);
  if (!city) return { title: "Crew not found | Civic" };

  const label = portalLabel(crewType);
  return {
    title: `Civic | ${city.name}. ${label} Crew`,
    description: `Reports and work orders routed to the ${label} crew in ${city.name}, ${city.state}.`,
  };
}

export default async function CrewPortalOverviewPage({
  params,
  searchParams,
}: PageProps) {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) notFound();
  const city = await resolveCity(slug);
  if (!city) notFound();

  const label = portalLabel(crewType);
  const categories = categoriesForCrewType(crewType);

  // Optional ?crew=<name> instance scope: resolve to a real crew OF THIS TYPE
  // (case-sensitive exact match) so the header can name it. Unresolved (demo
  // city, no such crew) → undefined → the type-level header, unchanged.
  const { crew: crewParam } = await searchParams;
  let crewName: string | undefined;
  if (crewParam) {
    const crewsResult = await fetchCityCrews(city.id);
    if (crewsResult.ok) {
      crewName = crewsResult.crews.find(
        (c) => c.name === crewParam && c.crewType === crewType,
      )?.name;
    }
  }

  // Every panel derives client-side from the category-locked corpus (see
  // TeamsInteractive). This is only the SSR stat-card snapshot, same as the
  // city overview page. safeQuery + the RPC's null-coalesced fields mean a
  // synthetic/demo city id degrades to zeroed stats instead of throwing.
  const stats = await fetchCityStats(
    city.id,
    city.active ? undefined : PREVIEW_SOURCES,
  );

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <div className="mb-5">
          <CrewPortalHeader
            crewType={crewType}
            label={label}
            categories={categories}
            crewName={crewName}
          />
        </div>

        <TeamsInteractive initialStats={stats} />
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
