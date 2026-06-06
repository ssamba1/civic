import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import Link from "next/link";

import { KNOWN_CITIES, fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb, fetchCityStats } from "@/lib/dashboard-queries";
import { TeamsInteractive } from "@/components/teams/teams-interactive";
import { FilterBar } from "@/components/filters/filter-bar";
import { CitySwitcher } from "@/components/city/city-switcher";

export function generateStaticParams() {
  return Object.keys(KNOWN_CITIES).map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) {
    city = await fetchCityMock(slug);
  }
  if (!city) return { title: "City not found | Civic" };

  const title = `Civic | ${city.name}, ${city.state} — Teams & Delegation`;
  const description = `Per-team workload and delegation for ${city.name}, ${city.state}. Backlog by division, default routing rules, per-report reassignment.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Civic",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CityDashboardPage({
  params,
}: PageProps) {
  const { slug } = await params;
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) {
    city = await fetchCityMock(slug);
  }
  if (!city) notFound();

  const stats = await fetchCityStats(city.id);

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="flex-grow mx-auto w-full max-w-7xl px-4 pt-20 pb-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="mb-10">
          {/* Municipality switcher — search + toggle between cities */}
          <div className="mb-5">
            <CitySwitcher currentSlug={slug} />
          </div>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#0a84ff] shadow-[0_0_6px_rgba(10,132,255,0.6)]"
                  aria-hidden="true"
                />
                {city.name}, {city.state}
              </p>
              <h1 className="mt-2 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold tracking-tight text-white leading-[1.1]">
                Teams
              </h1>
              <p className="mt-2 max-w-xl text-sm text-zinc-400">
                Workload, delegation, and queue depth across municipal divisions.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-400">
                <span>
                  <span className="font-medium text-zinc-200">
                    {stats.total.toLocaleString()}
                  </span>{" "}
                  tracked
                </span>
                <span className="h-3 w-px bg-white/[0.08] hidden sm:block" aria-hidden="true" />
                <span>
                  <span className="font-medium text-zinc-200">{stats.open}</span> open
                </span>
                <span className="h-3 w-px bg-white/[0.08] hidden sm:block" aria-hidden="true" />
                <span>
                  <span className="font-medium text-zinc-200">
                    {stats.this_week}
                  </span>{" "}
                  this week
                </span>
              </div>
            </div>
            <Link
              href="/report"
              className="inline-flex h-11 min-w-[44px] self-start sm:self-auto items-center gap-1.5 rounded-full bg-[#0a84ff] px-5 text-[14px] font-medium text-white outline-none transition-colors hover:bg-[#0070e0] focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <Camera className="h-4 w-4" />
              Report an issue
            </Link>
          </div>
        </section>

        <div className="mb-6">
          <FilterBar />
        </div>

        <TeamsInteractive initialStats={stats} />
      </div>

      <footer className="border-t border-white/[0.06] mt-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-[13px] text-zinc-500 sm:flex-row sm:px-6 lg:px-8">
          <span>Civic</span>
          <span>&copy; {new Date().getFullYear()} · Open311 compatible</span>
        </div>
      </footer>
    </div>
  );
}
