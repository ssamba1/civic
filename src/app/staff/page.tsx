import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StaffInbox } from "@/components/staff/staff-inbox";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE, findDemoAccount } from "@/lib/demo-auth";
import { createLogger } from "@/lib/logger";
import {
  buildCategoryTeamDisplay,
  fetchCityTeams,
} from "@/lib/onboarding/city-teams";
import { normalizeLocation, type WorkOrderWithDetails } from "@/lib/types";

const logger = createLogger("[staff-page]");

export type { WorkOrderWithDetails };

export const metadata = {
  title: "Staff Inbox | Civic",
  description: "Work order dispatch and management",
};

async function getWorkOrders(cityId: string): Promise<WorkOrderWithDetails[]> {
  const db = createServerClient();

  const { data, error } = await db
    .from("work_orders")
    .select(
      `
      *,
      reports!report_id (
        id,
        city_id,
        reporter_id,
        location,
        photo_public_url,
        photo_raw_url,
        status,
        address,
        description,
        created_at,
        updated_at,
        classifications (
          category,
          subcategory,
          severity,
          hazard_radius_m,
          visible_size_estimate,
          is_emergency,
          confidence,
          reasoning,
          no_issue_detected,
          alternate_categories
        )
      )
    `,
    )
    .eq("reports.city_id", cityId)
    .order("priority_score", { ascending: false });

  if (error) {
    logger.error("Work orders fetch failed", error);
    return [];
  }

  // Flatten nested relations: reports is a single object, classifications is an array
  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const report = Array.isArray(row.reports)
        ? row.reports[0]
        : (row.reports as Record<string, unknown> | null);

      if (!report) return null;

      const classificationsRaw = report.classifications;
      const classification = Array.isArray(classificationsRaw)
        ? (classificationsRaw[0] ?? null)
        : (classificationsRaw ?? null);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { reports: _reports, ...rest } = row as Record<string, unknown> & {
        reports: unknown;
      };

      return {
        ...rest,
        report: {
          id: report.id,
          city_id: report.city_id,
          reporter_id: report.reporter_id,
          location: normalizeLocation(report.location) ?? { lng: 0, lat: 0 },
          photo_public_url: report.photo_public_url,
          photo_raw_url: report.photo_raw_url ?? null,
          status: report.status,
          address: report.address ?? null,
          description: report.description ?? null,
          created_at: report.created_at,
          updated_at: report.updated_at,
        },
        classification,
      };
    })
    .filter(Boolean) as WorkOrderWithDetails[];
}

export default async function StaffPage() {
  const isDev = process.env.NODE_ENV === "development";
  const db = createServerClient();

  // C5: Auth check — use cookie-based client, not service-role
  const user = await getAuthUser();

  // Demo persona (soft auth, see demo-auth.ts) — authorized like the layout.
  const demoAccount = findDemoAccount(
    (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
  );

  let cityId: string | null = null;

  if (user) {
    const { data: userRow } = await db
      .from("users")
      .select("city_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      userRow &&
      ["staff_dispatcher", "staff_supervisor", "admin"].includes(userRow.role)
    ) {
      cityId = userRow.city_id;
    } else if (!isDev && !demoAccount) {
      redirect("/login?redirect=/staff");
    }
  } else if (!isDev && !demoAccount) {
    redirect("/login?redirect=/staff");
  }

  // Dev convenience (and staff without a resolved city): default to Cumming so
  // the inbox renders the real seeded data without forcing a login locally.
  if (!cityId) {
    const { data: city } = await db
      .from("cities")
      .select("id")
      .eq("slug", "cumming")
      .single();
    cityId = city?.id ?? null;
  }

  const fetchedAt = new Date().toISOString();
  const workOrders = cityId ? await getWorkOrders(cityId) : [];

  // Per-city team routing for the inbox: which team owns each report category.
  // Falls back to global defaults when the city wasn't onboarded via the wizard.
  const cityTeams = cityId ? await fetchCityTeams(cityId) : [];
  const cityRouting = buildCategoryTeamDisplay(cityTeams);

  return (
    <div className="flex h-full flex-col">
      <StaffInbox
        workOrders={workOrders}
        initialFetchedAt={fetchedAt}
        cityRouting={cityRouting}
        cityId={cityId ?? undefined}
      />
    </div>
  );
}
