import { notFound } from "next/navigation";
import { DashboardInteractive } from "@/components/dashboard/dashboard-interactive";
import { FilterBar } from "@/components/filters/filter-bar";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCityCenter,
  fetchCityStats,
} from "@/lib/dashboard-queries";

export const metadata = { title: "Browse Local Issues | Civic" };

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BrowsePage({ params }: PageProps) {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];
  // Center on the city itself: hardcoded coords for ship-with cities, else the
  // real geocoded center (city_center RPC / live geocode) so an onboarded city's
  // dashboard map doesn't fall back to Cumming. Stats and center are
  // independent of each other once the city resolves, fetch them together
  // rather than paying two serial round trips.
  const [stats, geocodedCenter] = await Promise.all([
    fetchCityStats(city.id),
    known?.center
      ? Promise.resolve(null)
      : fetchCityCenter(slug, city.name, city.state),
  ]);
  const center: [number, number] = known?.center ??
    geocodedCenter ?? [-84.14, 34.21];

  return (
    <div className="flex-grow mx-auto w-full max-w-[1800px] px-3 pt-city-content pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-6">
      <section className="mb-6 sm:mb-8">
        <p className="text-[13px] text-faint">
          {city.name}, {city.state}
        </p>
        <h1 className="mt-1 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1]">
          Browse local issues
        </h1>
        <p className="mt-2 sm:mt-3 text-sm text-subtle">
          See what's happening in your neighborhood.
        </p>
      </section>

      <div className="mb-4 sm:mb-6">
        <FilterBar />
      </div>

      <DashboardInteractive
        initialStats={stats}
        center={center}
        zoom={known?.zoom ?? 12}
      />
    </div>
  );
}
