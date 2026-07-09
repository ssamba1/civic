import { notFound } from "next/navigation";
import { Suspense } from "react";
import { categoriesForCrewType, isPortalCrewType } from "@/lib/crew-portal";
import type { DashboardReport } from "@/lib/dashboard-data";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCorpus,
  PREVIEW_SOURCES,
} from "@/lib/dashboard-queries";
import { DEMO_MODE } from "@/lib/demo-mode";
import { FilterProvider } from "@/lib/filters/context";

/**
 * Crew-type-scoped subtree of the canonical city console — mirrors the team
 * subtree (src/app/city/[slug]/team/[teamId]/layout.tsx) exactly, except the
 * lock is a CATEGORY SET, not a team: crew types span divisions (e.g.
 * `cleanup` serves 3 teams), so there's no single team id to pin. Inherits
 * the city chrome (CityHeader/CitySidebar) from the parent layout and
 * re-provides the filter context with the categories LOCKED, so every reused
 * surface (dashboard, calendar) only sees this crew type's report
 * categories.
 */
export default async function CrewPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; crewType: string }>;
}) {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) notFound();

  // Same corpus resolution as the parent city layout — fetchCity/fetchCorpus
  // are request-cached, so this costs no extra queries.
  let corpus: DashboardReport[];
  if (DEMO_MODE && slug in KNOWN_CITIES) {
    corpus = getReportCorpus();
  } else {
    const city = await fetchCity(slug);
    if (!city) notFound();
    corpus = await fetchCorpus(
      city.id,
      city.active ? undefined : PREVIEW_SOURCES,
    );
  }

  return (
    <Suspense fallback={null}>
      <FilterProvider
        corpus={corpus}
        now={Date.now()}
        lockedCategories={categoriesForCrewType(crewType)}
      >
        {children}
      </FilterProvider>
    </Suspense>
  );
}
