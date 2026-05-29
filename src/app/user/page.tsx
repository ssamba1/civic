import { redirect } from "next/navigation";

// The resident "my reports" surface has been folded into the staff dashboard.
// Anything landing under /user now goes to the single dashboard at /staff.
export default function UserIndexPage() {
  redirect("/staff");
}
