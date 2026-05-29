import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchRecentReports } from "@/lib/dashboard-queries";
import { FullscreenMapOrchestrator } from "@/components/map/fullscreen-map";

// Staff map view — same fullscreen orchestrator as the public map, scoped to
// the staff's city (Cumming for the demo).
export default async function StaffMapPage() {
  const slug = "cumming";
  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];
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
