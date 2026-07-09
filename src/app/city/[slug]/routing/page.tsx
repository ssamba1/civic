import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CityRoutingFlow } from "@/components/routing/city-routing-flow";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { DEMO_CITY } from "@/lib/demo-auth";
import { fetchRoutingFlowData } from "@/lib/routing/flow-data";
import { isStaffForCity } from "@/lib/staff-access";

interface PageProps {
  params: Promise<{ slug: string }>;
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
  if (!city) city = await fetchCityMock(slug);
  if (!city) return { title: "City not found | Civic" };
  return {
    title: `Civic | ${city.name}, ${city.state} — Routing`,
    description: `Live flow chart of how ${city.name} routes reports — AI classification through divisions to the crews that do the work.`,
  };
}

// Same per-city operational gate as the grid: demo city stays public (it's
// the showcase), every other city's crew/dispatch structure requires staff.
async function requireStaffFor(slug: string): Promise<void> {
  if (await isStaffForCity(slug)) return;
  redirect(`/login?redirect=/city/${slug}/routing`);
}

export default async function CityRoutingPage({ params }: PageProps) {
  const { slug } = await params;

  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) notFound();

  if (slug !== DEMO_CITY) await requireStaffFor(slug);

  const flow = await fetchRoutingFlowData(city.id ?? null);

  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <div className="relative mx-auto w-full max-w-[1800px] flex-grow px-3 pt-city-content pb-10 sm:px-4 lg:px-6">
        <section className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold leading-tight tracking-tight text-foreground">
              Routing
            </h1>
            <p className="text-[13px] text-faint">
              How a report becomes a crew&apos;s job — photo to dispatch, live.
            </p>
          </div>
        </section>

        <CityRoutingFlow slug={slug} data={flow} />
      </div>
    </div>
  );
}
