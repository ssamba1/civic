import { CorpusMapView } from "@/components/map/corpus-map-view";
import { getReportCorpus, KNOWN_CITIES } from "@/lib/dashboard-data";
import { FilterProvider } from "@/lib/filters/context";

export const metadata = { title: "Community Map | Civic" };

/**
 * Resident "community near me" surface: the same fullscreen map the city/team
 * views use, but in read-only mode. No dispatch/route affordances, an upvote on
 * each list row instead. Reuses CorpusMapView (→ FullscreenMapOrchestrator),
 * which reads the shared corpus from FilterProvider.
 *
 * The city is fixed to Cumming (the app default, there is no per-user city_id).
 * The negative margins cancel the /user layout's <main> padding so the map fills
 * the viewport; the BottomTabBar floats over its bottom edge.
 */
export default function UserMapPage() {
  const corpus = getReportCorpus();
  const now = Date.now();
  const city = KNOWN_CITIES.cumming;

  return (
    <div className="flex flex-1 flex-col min-h-0 -mt-4 md:-mt-20 -mb-[calc(5.5rem+env(safe-area-inset-bottom))] md:mb-0">
      <FilterProvider corpus={corpus} now={now}>
        <CorpusMapView
          center={city.center}
          zoom={city.zoom}
          cityName={city.name}
          readOnly
        />
      </FilterProvider>
    </div>
  );
}
