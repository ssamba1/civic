import { notFound } from "next/navigation";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import { fetchCity, fetchCityStats, fetchUserUpvotes } from "@/lib/dashboard-queries";
import { DashboardInteractive } from "@/components/dashboard/dashboard-interactive";
import { FilterBar } from "@/components/filters/filter-bar";

export const metadata = { title: "Browse Local Issues | Civic" };

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BrowsePage({ params }: PageProps) {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];
  const [stats, upvotedIds] = await Promise.all([
    fetchCityStats(city.id),
    fetchUserUpvotes(),
  ]);

  return (
    <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-20 pb-10 sm:px-6 lg:px-8">
      <section className="mb-8">
        <p className="text-[13px] text-zinc-500">
          {city.name}, {city.state}
        </p>
        <h1 className="mt-1 text-[34px] sm:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
          Browse local issues
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          Upvote the issues that matter most to your neighborhood.
        </p>
      </section>

      <div className="mb-6">
        <FilterBar />
      </div>

      <DashboardInteractive
        initialStats={stats}
        center={known?.center ?? [-84.14, 34.21]}
        zoom={known?.zoom ?? 12}
        upvotedIds={upvotedIds}
      />
    </div>
  );
}
