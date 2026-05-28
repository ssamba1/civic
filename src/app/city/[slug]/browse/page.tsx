import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { KNOWN_CITIES } from "@/lib/dashboard-data";
import {
  fetchCity,
  fetchCityStats,
  fetchCategoryBreakdown,
  fetchRecentReports,
  fetchUserUpvotes,
} from "@/lib/dashboard-queries";
import { DashboardInteractive } from "@/components/dashboard/dashboard-interactive";

export const metadata = { title: "Browse Local Issues | Civic" };

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BrowsePage({ params }: PageProps) {
  const { slug } = await params;
  const city = await fetchCity(slug);
  if (!city) notFound();

  const known = KNOWN_CITIES[slug];
  const [stats, categories, reports, upvotedIds] = await Promise.all([
    fetchCityStats(city.id),
    fetchCategoryBreakdown(city.id),
    fetchRecentReports(city.id, 100),
    fetchUserUpvotes(),
  ]);

  // Sort by community upvotes — the loudest issues first.
  const sorted = [...reports].sort((a, b) => b.upvote_count - a.upvote_count);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
          <MapPin className="h-4 w-4" />
          Browse Local Issues
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          {city.name}, {city.state}
        </h1>
        <p className="mt-2 text-zinc-500">
          Vote up the issues that matter most to your neighborhood. Sorted by
          community upvotes.
        </p>
      </section>

      <DashboardInteractive
        initialStats={stats}
        initialCategories={categories}
        initialReports={sorted}
        center={known?.center ?? [-84.14, 34.21]}
        zoom={known?.zoom ?? 12}
        upvotedIds={upvotedIds}
      />
    </div>
  );
}
