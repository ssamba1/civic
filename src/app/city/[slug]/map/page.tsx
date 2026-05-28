import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchRecentReports } from "@/lib/dashboard-queries";
import { FullscreenMapOrchestrator } from "@/components/map/fullscreen-map";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function FullscreenMapPage({ params }: PageProps) {
  const { slug } = await params;

  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];

  // Fetch up to 100 recent reports to provide a rich dataset for concentration & dispersal maps
  const reports = await fetchRecentReports(city.id, 100);

  return (
    <FullscreenMapOrchestrator
      reports={reports}
      center={known?.center ?? [-84.14, 34.21]}
      zoom={known?.zoom ?? 12}
      cityName={city.name}
    />
  );
}
