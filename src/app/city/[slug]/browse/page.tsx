import { notFound } from "next/navigation";
import { DashboardInteractive } from "@/components/dashboard/dashboard-interactive";
import { FilterBar } from "@/components/filters/filter-bar";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchCityStats } from "@/lib/dashboard-queries";

export const metadata = { title: "Browse Local Issues | Civic" };

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BrowsePage({ params }: PageProps) {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];
  const stats = await fetchCityStats(city.id);

  return (
    <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-city-content pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <section className="mb-6 sm:mb-8">
        <p className="text-[13px] text-zinc-500">
          {city.name}, {city.state}
        </p>
        <h1 className="mt-1 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
          Browse local issues
        </h1>
        <p className="mt-2 sm:mt-3 text-sm text-zinc-400">
          See what's happening in your neighborhood.
        </p>
      </section>

      <div className="mb-4 sm:mb-6">
        <FilterBar />
      </div>

      <DashboardInteractive
        initialStats={stats}
        center={known?.center ?? [-84.14, 34.21]}
        zoom={known?.zoom ?? 12}
      />
    </div>
  );
}
