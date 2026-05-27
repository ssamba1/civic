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
  };
}

async function getWorkOrders() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("work_orders")
    .select(
      `
      *,
      report:reports!report_id (
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
        updated_at
      ),
      classification:classifications!report_id (
        category,
        subcategory,
        severity,
        hazard_radius_m,
        visible_size_estimate,
        is_emergency,
        confidence,
        reasoning
      )
    `
    )
    .order("priority_score", { ascending: false });

  if (error) {
    console.error("Failed to fetch work orders:", error.message);
    return [];
  }

  // Supabase returns nested relations; flatten single-object relations
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    report: Array.isArray(row.report) ? row.report[0] : row.report,
    classification: Array.isArray(row.classification)
      ? row.classification[0]
      : row.classification,
  })) as WorkOrderWithDetails[];
}

export default async function StaffPage() {
  const workOrders = await getWorkOrders();

  return (
    <div className="flex h-full flex-col">
      <StaffInbox workOrders={workOrders} />
    </div>
  );
}
