import { notFound } from "next/navigation";

import { CorpusMapView } from "@/components/map/corpus-map-view";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { isValidTeamId, TEAMS } from "@/lib/teams";

interface PageProps {
  params: Promise<{ team: string; city: string }>;
}

export default async function TeamMapPage({ params }: PageProps) {
  const { team, city } = await params;
  if (!isValidTeamId(team) || team === "all" || !(city in KNOWN_CITIES)) {
    notFound();
  }

  const known = KNOWN_CITIES[city];

  // Full-bleed, edge-to-edge under the (transparent on /map) team header —
  // identical chrome to the city map, scoped + locked to this team.
  return (
    <CorpusMapView
      teamId={team}
      center={known.center}
      zoom={known.zoom}
      cityName={TEAMS[team].shortLabel}
    />
  );
}
