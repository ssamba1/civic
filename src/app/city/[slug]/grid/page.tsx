import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WorkOrderGrid } from "@/components/city/work-order-grid";
import type { CrewTypeDef } from "@/lib/crew-types";
import { DEFAULT_CREW_TYPES } from "@/lib/crew-types";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { fetchCityCrewTypes } from "@/lib/db/crew-types";
import { getCityCrewOptions, getGridRows } from "@/lib/dashboard-grid-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { DEMO_CITY } from "@/lib/demo-auth";
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
    title: `Civic | ${city.name}, ${city.state} — Work Order Grid`,
    description: `Spreadsheet of every report and work order for ${city.name}, ${city.state} — sortable, filterable, emergencies surfaced without a work order.`,
  };
}

/**
 * Gate this city's operational grid behind the shared, per-city operational
 * access check (isStaffForCity: demo persona scoped to the demo city, OR
 * dev-bypass, OR a real staff/admin role whose home city matches `slug`). The
 * demo city stays open — it's the public showcase — so this only runs for every
 * OTHER city (see the `slug !== DEMO_CITY` call site), whose per-work-order
 * cost/crew/department data is not public. Single source of truth so this gate
 * can never drift from the nav-visibility checks.
 */
async function requireStaffFor(slug: string): Promise<void> {
  if (await isStaffForCity(slug)) return;
  redirect(`/login?redirect=/city/${slug}/grid`);
}

export default async function CityGridPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve the city the same way the dashboard page does: real DB row first,
  // falling back to the synthetic KNOWN_CITIES entry so demo slugs still resolve.
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) notFound();

  // Public only for the demo city; every other city requires staff auth.
  if (slug !== DEMO_CITY) await requireStaffFor(slug);

  const rows = await getGridRows(city.id);

  // Crew assignment is a staff control: the demo city renders publicly, so the
  // dropdown (and the crews list feeding it) only ships to staff sessions. The
  // server action re-checks staff + city on every call regardless.
  const canAssign = await isStaffForCity(slug);
  const crews = canAssign ? await getCityCrewOptions(city.id) : [];

  // Per-city crew-type catalog (031) so the grid's crew filter + edit dropdown
  // can show/select custom types even before any work order uses them. Degrades
  // to the built-in defaults on a pre-031 DB (fetch returns a tagged failure).
  const crewTypesResult = await fetchCityCrewTypes(city.id);
  const crewTypes: CrewTypeDef[] =
    crewTypesResult.ok && crewTypesResult.types.length > 0
      ? crewTypesResult.types
          .filter((t) => t.active)
          .map((t) => ({ key: t.key, label: t.label, description: t.description }))
      : DEFAULT_CREW_TYPES;

  return (
    // Full-bleed: the grid owns the entire content area (toolbar padding lives
    // inside WorkOrderGrid). Mobile keeps the fixed-CityHeader offset; md+
    // (sidebar shell, no fixed header) is edge-to-edge.
    <div className="flex h-dvh w-full flex-col pt-[calc(env(safe-area-inset-top)+8rem)] md:pt-0">
      {/* Visible title chrome removed to give the grid the full viewport;
          the h1 survives for a11y/SEO. */}
      <h1 className="sr-only">Work Order Grid</h1>
      <WorkOrderGrid
        rows={rows}
        cityId={city.id}
        crews={crews}
        crewTypes={crewTypes}
        canAssign={canAssign}
      />
    </div>
  );
}
