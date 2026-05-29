import { redirect } from "next/navigation";

// The resident report-detail surface has been merged into the staff dashboard.
// Deep links (submission confirmation, notifications) now forward to /staff.
export const dynamic = "force-dynamic";

export default function ReportDetailPage() {
  redirect("/staff");
}
