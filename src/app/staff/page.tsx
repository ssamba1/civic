import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createServerClient } from "@/lib/db/client";
import { StaffInbox } from "@/components/staff/staff-inbox";

export const metadata = {
  title: "Staff Inbox | Civic",
  description: "Work order dispatch and management",
};

// Joined row shape returned from Supabase query
export interface WorkOrderWithDetails {
  id: string;
  report_id: string;
  department: string;
  crew_type: string | null;
  priority_score: number;
  est_minutes: number;
  materials: string[];
  assigned_crew_id: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  resolution_photo_url: string | null;
  resolution_ai_score: number | null;
  report: {
    id: string;
    city_id: string;
    reporter_id: string;
    location: { lng: number; lat: number };
    photo_public_url: string;
    photo_raw_url: string | null;
    status: string;
    address: string | null;
    description: string | null;
    created_at: string;
    updated_at: string;
  };
  classification: {
    category: string;
    subcategory: string;
    severity: number;
    hazard_radius_m: number;
    visible_size_estimate: string;
    is_emergency: boolean;
    confidence: number;
    reasoning: string;
  } | null;
}

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
  if (userRow.role !== "staff") redirect("/login");

  const cityId: string = userRow.city_id;

  const workOrders = await getWorkOrders(cityId);

  return (
    <div className="flex h-full flex-col">
      <StaffInbox workOrders={workOrders} />
    </div>
  );
}
