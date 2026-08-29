import { notFound } from "next/navigation";

import { CorpusMapView } from "@/components/map/corpus-map-view";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchCityCenter } from "@/lib/dashboard-queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function FullscreenMapPage({ params }: PageProps) {
  const { slug } = await params;

  const city = await fetchCity(slug);
  if (!city) notFound();

  // Center resolution: hardcoded coords for ship-with cities (instant, offline),
  // else the city's real geocoded center (DB point or live geocode) so every
  // onboarded city centers on itself instead of falling back to Cumming.
  const known = KNOWN_CITIES[slug];
  const center: [number, number] = known?.center ??
    (await fetchCityCenter(slug, city.name, city.state)) ?? [-84.14, 34.21];

  // All-teams map: reads the same shared corpus as the team maps, so the city
  // view is always a superset of every team and reflects task completions.
  // Cesium/ion resource hints live in this segment's layout.tsx so they flush
  // ahead of the page body in the stream.
  return (
    <CorpusMapView
      center={center}
      zoom={known?.zoom ?? 12}
      cityName={city.name}
    />
  );
}
