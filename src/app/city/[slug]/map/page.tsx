import { notFound } from "next/navigation";

import { CorpusMapView } from "@/components/map/corpus-map-view";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity } from "@/lib/dashboard-queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function FullscreenMapPage({ params }: PageProps) {
  const { slug } = await params;

  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];

  // All-teams map: reads the same shared corpus as the team maps, so the city
  // view is always a superset of every team and reflects task completions.
  return (
    <CorpusMapView
      center={known?.center ?? [-84.14, 34.21]}
      zoom={known?.zoom ?? 12}
      cityName={city.name}
    />
  );
}
