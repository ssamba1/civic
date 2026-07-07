import { cookies } from "next/headers";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import {
  DEMO_CITY,
  DEMO_SESSION_COOKIE,
  isDemoStaffAccount,
} from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";

const log = createLogger("staff-access");

/**
 * How the current request qualifies as operational staff for a city:
 *
 *  - `"real"` — an authenticated Supabase user with a staff/admin role whose
 *    `users.city_id` matches the city owning `slug` (or the local-only dev
 *    bypass, which only exists on a developer's machine).
 *  - `"demo"` — a verified demo staff persona. Demo credentials are baked into
 *    the public bundle, so `"demo"` proves nothing about who the visitor is —
 *    PII-bearing surfaces (member emails etc.) may render for `"demo"` but must
 *    mask anything sensitive. Demo personas are all Cumming-scoped, so this is
 *    only ever granted for `DEMO_CITY`.
 *  - `null` — not staff for this city.
 */
export type StaffAccess = "real" | "demo" | null;

/**
 * SERVER-ONLY. Resolve the request's staff access level FOR `slug`
 * specifically — the slug is enforced, not advisory. A city-A admin never
 * passes for city B; synthetic KNOWN_CITIES slugs with no `cities` row (only
 * the demo city) deny real users, and the demo path covers the demo city.
 *
 * The real-user path is checked before the demo cookie so a genuine staff
 * session always outranks a demo persona (and sees unmasked data).
 *
 * This does NOT apply the demo-city-is-always-open bypass — callers whose
 * surface is meant to be public for the demo city must OR in their own
 * `slug === DEMO_CITY` bypass, same as the grid page does.
 */
export async function getStaffAccessForCity(
  slug: string,
): Promise<StaffAccess> {
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (devBypass) return "real";

  const user = await getAuthUser();
  if (user) {
    const db = createServerClient();
    const { data: profile, error: profileErr } = await db
      .from("users")
      .select("role, city_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      // Fail closed, but never silently — an unlogged outage here reads as an
      // inexplicable staff lockout (login loop, vanished nav).
      log.error("users role lookup failed", profileErr, { slug });
    }
    const isStaffRole =
      !!profile &&
      ["staff_dispatcher", "staff_supervisor", "admin"].includes(profile.role);
    if (isStaffRole && profile.city_id) {
      // Enforce per-city scope: resolve the city that owns `slug` and require
      // the user's home city_id to match.
      const { data: cityRow, error: cityErr } = await db
        .from("cities")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (cityErr) {
        log.error("city slug lookup failed", cityErr, { slug });
      }
      if (cityRow && cityRow.id === profile.city_id) return "real";
    }
  }

  const demoStaff =
    DEMO_MODE &&
    // Demo personas are all Cumming-scoped: a verified demo staff cookie only
    // proves staff for the demo city, never any onboarded city's live data.
    slug === DEMO_CITY &&
    isDemoStaffAccount(
      // Verify the HMAC signature before trusting the persona — a bare/forged
      // civic_demo_session cookie must not prove staff access.
      findVerifiedDemoAccount(
        (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
      ),
    );
  if (demoStaff) return "demo";

  return null;
}

/**
 * SERVER-ONLY. True iff the current request is operational staff for `slug`
 * (real or demo — see getStaffAccessForCity for the distinction). Single
 * source of truth so nav-visibility checks and page access gates can never
 * drift apart. Surfaces that expose PII must call getStaffAccessForCity
 * directly and treat "demo" as untrusted.
 */
export async function isStaffForCity(slug: string): Promise<boolean> {
  return (await getStaffAccessForCity(slug)) !== null;
}
