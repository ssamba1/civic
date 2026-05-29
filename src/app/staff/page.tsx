import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createServerClient } from "@/lib/db/client";
import { StaffInbox } from "@/components/staff/staff-inbox";
import type { WorkOrderWithDetails } from "@/lib/types";

export { type WorkOrderWithDetails };

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
          reasoning
        )
      )
    `
    )
    .eq("reports.city_id", cityId)
    .order("priority_score", { ascending: false });

  if (error) {
    console.error("Failed to fetch work orders:", error.message);
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
          location: report.location,
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
  // Dev mode: return simple placeholder
  if (process.env.NODE_ENV === "development") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-auto p-8">
          <h1 className="text-2xl font-bold">Civic Staff Inbox</h1>
          <p className="mt-4 text-zinc-600">
            Staff dashboard is available when Supabase is properly configured.
          </p>
          <div className="mt-8 space-y-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="font-semibold">Dev Mode Active</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                To access real data, configure your Supabase credentials in .env.local
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // C5: Auth check — use cookie-based client, not service-role
  const user = await getAuthUser();
  if (!user) redirect("/login");

  // C5: Look up the staff member's city_id from the users table
  const db = createServerClient();
  const { data: userRow, error: userError } = await db
    .from("users")
    .select("city_id, role")
    .eq("id", user.id)
    .single();

  if (userError || !userRow) redirect("/login");
  if (
    !["staff_dispatcher", "staff_supervisor", "admin"].includes(userRow.role)
  ) {
    redirect("/login");
  }

  const cityId = userRow.city_id;

  const fetchedAt = new Date().toISOString();
  const workOrders = await getWorkOrders(cityId);

  return (
    <div className="flex h-full flex-col">
      <StaffInbox workOrders={workOrders} initialFetchedAt={fetchedAt} />
    </div>
  );
}
