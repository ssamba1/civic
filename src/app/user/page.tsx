import { redirect } from "next/navigation";

// Anon-first: no login wall. The bare /user index has no content of its own.
// Send residents to their reports, the home of the report→track→resolve loop.
export default function UserIndexPage() {
  redirect("/user/my-reports");
}
