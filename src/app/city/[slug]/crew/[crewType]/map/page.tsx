import { notFound } from "next/navigation";

import { CorpusMapView } from "@/components/map/corpus-map-view";
import { isPortalCrewType, portalLabel } from "@/lib/crew-portal";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchCityCenter } from "@/lib/dashboard-queries";

interface PageProps {
  params: Promise<{ slug: string; crewType: string }>;
}

export default async function CrewPortalMapPage({ params }: PageProps) {
  const { slug, crewType } = await params;
  if (!isPortalCrewType(crewType)) notFound();

  const city = await fetchCity(slug);
  const known = KNOWN_CITIES[slug];
  if (!city && !known) notFound();

  // Center resolution mirrors the city/team maps: hardcoded coords for
  // ship-with cities (instant, offline), else the city's real geocoded
  // center.
  const center: [number, number] = known?.center ??
    (city ? await fetchCityCenter(slug, city.name, city.state) : null) ?? [
      -84.14, 34.21,
    ];

  // Full-bleed map. CorpusMapView's `teamId` prop is the only scoping lever
  // it exposes and it's typed to TeamId — a crew type isn't one, and crew
  // types span divisions anyway, so there's no single team to pass. Omitted
  // here means this map is the same soft, unscoped surface as the city map
  // (documented in the plan's architecture note); the label below is purely
  // cosmetic, same as the team map's use of the team label.
  return (
    <CorpusMapView
      center={center}
      zoom={known?.zoom ?? 12}
      cityName={portalLabel(crewType)}
    />
  );
}
