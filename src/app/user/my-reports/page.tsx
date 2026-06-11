import { redirect } from "next/navigation";

// Stub — resident report list not yet built. Auth is enforced by layout.
export default function MyReportsPage() {
  redirect("/login");
}
