import { cookies } from "next/headers";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE, isDemoStaffAccount } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";

/**
 * SERVER-ONLY. True iff the current request is operational staff (demo
 * admin/team persona, dev-bypass, or a real staff_dispatcher/staff_supervisor/
 * admin role) for `slug`. Mirrors requireStaffFor() in
 * city/[slug]/grid/page.tsx minus the redirect — single source of truth so
 * nav-visibility checks and the grid's access gate can never drift apart.
 * `slug` is unused today (the underlying role check isn't per-city) but kept
 * in the signature for parity with callers that are inherently per-city, and
 * in case a future per-city staff scope is added.
 *
 * This does NOT apply the demo-city-is-always-open bypass — callers that need
 * that (e.g. nav visibility, the grid page itself) must OR it in themselves,
 * same as the grid page already does with `slug !== DEMO_CITY`.
 */
export async function isStaffForCity(slug: string): Promise<boolean> {
  const demoStaff =
    DEMO_MODE &&
    isDemoStaffAccount(
      // Verify the HMAC signature before trusting the persona — a bare/forged
      // civic_demo_session cookie must not prove staff access.
      findVerifiedDemoAccount(
        (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
      ),
    );
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (demoStaff || devBypass) return true;

  const user = await getAuthUser();
  if (user) {
    const db = createServerClient();
    const { data } = await db
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      data &&
      ["staff_dispatcher", "staff_supervisor", "admin"].includes(data.role)
    ) {
      return true;
    }
  }

  return false;
}
