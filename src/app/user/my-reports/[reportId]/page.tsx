import { redirect } from "next/navigation";

// Stub — resident report detail not yet built. Auth is enforced by layout.
export const dynamic = "force-dynamic";

export default function ReportDetailPage() {
  redirect("/login");
}
