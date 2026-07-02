import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { WorkOrderGrid } from "@/components/city/work-order-grid";
import { fetchCity as fetchCityMock } from "@/lib/dashboard-data";
import { getGridRows } from "@/lib/dashboard-grid-data";
import { fetchCity as fetchCityFromDb } from "@/lib/dashboard-queries";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import {
  DEMO_CITY,
  DEMO_SESSION_COOKIE,
  findDemoAccount,
  isDemoStaffAccount,
} from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";

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
 * Gate this city's operational grid behind an operational-access check
 * (demo persona OR dev-bypass OR a real staff/admin role). The demo city
 * stays open — it's the public showcase — so this only runs for every OTHER
 * city, whose per-work-order cost/crew/department data is not public.
 * No new RBAC concept.
 */
async function requireStaffFor(slug: string): Promise<void> {
  // Demo-session acceptance is gated on demo mode being ON: on a live
  // (non-demo) deployment the civic_demo_session cookie is ignored entirely —
  // only real Supabase auth below can grant access. Even in demo mode, the
  // persona must actually be staff (city admin or a team crew); a Resident
  // persona (role "user") is never operational staff. Without both checks the
  // baked, public demo cookie would prove staff on live data.
  const demoStaff =
    DEMO_MODE &&
    isDemoStaffAccount(
      findDemoAccount((await cookies()).get(DEMO_SESSION_COOKIE)?.value),
    );
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (demoStaff || devBypass) return;

  const user = await getAuthUser();
  if (user) {
    const db = createServerClient();
    const { data } = await db
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      data &&
      ["staff_dispatcher", "staff_supervisor", "admin"].includes(data.role)
    ) {
      return;
    }
  }

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

  return (
    <div className="mx-auto flex h-dvh w-full max-w-7xl flex-col px-4 pt-city-content pb-6 sm:px-6 lg:px-8">
      {/* Visible title chrome removed to give the grid the full viewport;
          the h1 survives for a11y/SEO. */}
      <h1 className="sr-only">Work Order Grid</h1>
      <WorkOrderGrid rows={rows} />
    </div>
  );
}
