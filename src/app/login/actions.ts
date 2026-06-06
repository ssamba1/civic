"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateDemo, DEMO_SESSION_COOKIE } from "@/lib/demo-auth";

/* Demo persona sign-in. Validates against the baked credential table, sets a
   session cookie, and redirects to the persona's home. DEMO ONLY — see
   demo-auth.ts. On bad credentials, redirects back to /login with an error. */
export async function signInDemo(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const account = authenticateDemo(username, password);
  if (!account) {
    redirect(
      `/login?demo_error=${encodeURIComponent("Invalid demo username or password")}`,
    );
  }

  const store = await cookies();
  store.set(DEMO_SESSION_COOKIE, account.username, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  redirect(account.home);
}

export async function signOutDemo(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
  redirect("/login");
}
