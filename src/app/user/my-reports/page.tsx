import { redirect } from "next/navigation";

// Merged into the staff dashboard. The report-tracker stat tiles that lived
// here now render inside the staff inbox at /staff; this route just forwards.
export default function MyReportsPage() {
  redirect("/staff");
}
