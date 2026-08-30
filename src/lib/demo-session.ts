import { cookies } from "next/headers";
import { DEMO_SESSION_COOKIE, type DemoAccount } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";

/* Server-only: resolve the active demo persona from the session cookie.
   Used by server layouts to label the header + render the logout control.
   Not a security gate — routing is soft. */
export async function getDemoSession(): Promise<DemoAccount | null> {
  const store = await cookies();
  const username = store.get(DEMO_SESSION_COOKIE)?.value;
  return findVerifiedDemoAccount(username);
}
