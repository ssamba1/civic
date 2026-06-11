import { redirect } from "next/navigation";

// Stub — resident dashboard content not yet built. Auth is enforced by layout.
export default function UserIndexPage() {
  redirect("/login");
}
