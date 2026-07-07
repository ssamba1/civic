import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WorkOrderGrid } from "@/components/city/work-order-grid";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { getGridRows } from "@/lib/dashboard-grid-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { DEMO_CITY } from "@/lib/demo-auth";
import { isStaffForCity } from "@/lib/staff-access";
import { categoryToTeamDefault, isValidTeamId, TEAMS } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";

interface PageProps {
  params: Promise<{ team: string; city: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { team, city: slug } = await params;
  if (!isValidTeamId(team) || team === "all") {
    return { title: "Team not found | Civic" };
  }
  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) return { title: "City not found | Civic" };
  const teamLabel = TEAMS[team].shortLabel;
  return {
    title: `Civic | ${teamLabel} — ${city.name}, ${city.state} Work Orders`,
    description: `Work-order grid scoped to ${teamLabel} in ${city.name}, ${city.state} — every report this team owns, sortable and filterable.`,
  };
}

/**
 * Same operational-access gate as the city grid (city/[slug]/grid/page.tsx),
 * routed to the team-scoped login redirect. The demo city stays open — it's the
 * public showcase — so the gate only runs for every OTHER city, whose
 * per-work-order cost/crew data is not public. isStaffForCity() is the shared
 * source of truth (demo staff persona OR dev-bypass OR real staff/admin role);
 * the demo-city bypass is OR'd in here, matching the city grid page.
 */
async function requireStaffFor(team: string, slug: string): Promise<void> {
  if (slug === DEMO_CITY) return;
  if (await isStaffForCity(slug)) return;
  redirect(`/login?redirect=/${team}/${slug}/grid`);
}

export default async function TeamGridPage({ params }: PageProps) {
  const { team, city: slug } = await params;

  // The layout already validates team/city, but the page guards too — the "all"
  // admin pseudo-team has no team grid (use the city grid for the aggregate).
  if (!isValidTeamId(team) || team === "all") notFound();

  let city = null;
  try {
    city = await fetchCityFromDb(slug);
  } catch {
    city = null;
  }
  if (!city) city = await fetchCityMock(slug);
  if (!city) notFound();

  if (slug !== DEMO_CITY) await requireStaffFor(team, slug);

  const allRows = await getGridRows(city.id);
  // Scope to this team's issues. Team ownership is DERIVED from category via the
  // default (non-override) mapping — the same derivation the grid's Team column
  // uses. Per-category overrides live only in client storage, so server-side
  // filtering deterministically uses the default map.
  const rows = allRows.filter(
    (r) =>
      categoryToTeamDefault((r.category ?? "other") as ReportCategory) === team,
  );

  return (
    <div className="flex h-dvh w-full flex-col pt-[calc(env(safe-area-inset-top)+8rem)] md:pt-0">
      <h1 className="sr-only">{TEAMS[team].shortLabel} Work Order Grid</h1>
      <WorkOrderGrid rows={rows} cityId={city.id} />
    </div>
  );
}
