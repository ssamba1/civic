"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateDemo, DEMO_SESSION_COOKIE } from "@/lib/demo-auth";
import { signDemoSession } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";

/* Demo persona sign-in. Validates against the baked credential table, sets a
   session cookie, and redirects to the persona's home. DEMO ONLY. See
   demo-auth.ts. On bad credentials, redirects back to /login with an error. */
export async function signInDemo(formData: FormData): Promise<void> {
  // Live deployments hide the demo form (demo-sign-in.tsx), but the server
  // action must refuse too. The baked credentials are public.
  if (!DEMO_MODE) {
    redirect(
      `/login?demo_error=${encodeURIComponent("Demo accounts are disabled on this deployment")}`,
    );
  }
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const account = authenticateDemo(username, password);
  if (!account) {
    redirect(
      `/login?demo_error=${encodeURIComponent("Invalid demo username or password")}`,
    );
  }

  const store = await cookies();
  // Store an HMAC-signed value, not the bare username. A bare username lets
  // anyone forge staff access by hand-setting the cookie. See lib/demo-cookie.
  store.set(DEMO_SESSION_COOKIE, signDemoSession(account.username), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  // Honor an explicit ?redirect (e.g. arriving from the /admin gate) over the
  // persona's default home. Only same-origin relative paths, never an absolute
  // or protocol-relative URL. To avoid an open redirect.
  const redirectTo = String(formData.get("redirect") ?? "");
  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : null;

  redirect(safeRedirect ?? account.home);
}

export async function signOutDemo(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
  redirect("/login");
}
