import { notFound } from "next/navigation";

import { CorpusMapView } from "@/components/map/corpus-map-view";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchCityCenter } from "@/lib/dashboard-queries";
import { isValidTeamId, TEAMS } from "@/lib/teams";

interface PageProps {
  params: Promise<{ slug: string; teamId: string }>;
}

export default async function TeamMapPage({ params }: PageProps) {
  const { slug, teamId } = await params;
  if (!isValidTeamId(teamId) || teamId === "all") notFound();

  const city = await fetchCity(slug);
  const known = KNOWN_CITIES[slug];
  if (!city && !known) notFound();

  // Center resolution mirrors the city map: hardcoded coords for ship-with
  // cities (instant, offline), else the city's real geocoded center.
  const center: [number, number] = known?.center ??
    (city ? await fetchCityCenter(slug, city.name, city.state) : null) ?? [
      -84.14, 34.21,
    ];

  // Full-bleed team map — the layout's lockedTeam filter already scopes the
  // corpus; teamId here just labels and colors the view.
  return (
    <CorpusMapView
      teamId={teamId}
      center={center}
      zoom={known?.zoom ?? 12}
      cityName={TEAMS[teamId].shortLabel}
    />
  );
}
