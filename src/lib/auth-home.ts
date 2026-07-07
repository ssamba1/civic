import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-home");

const STAFF_ROLES = new Set(["admin", "staff_supervisor", "staff_dispatcher"]);

/**
 * Where a signed-in user should land post-auth: their city console if
 * they're staff of one, otherwise the homepage. Uses the service-role
 * client since this runs right after auth, before any RLS-scoped session
 * context is needed. Never throws — any lookup failure falls back to "/",
 * but always logs first: a silent fallback here means staff mysteriously
 * never reach their console.
 */
export async function resolveAuthHome(userId: string): Promise<string> {
  try {
    const db = createServerClient();
    const { data: userRow, error: userErr } = await db
      .from("users")
      .select("role, city_id")
      .eq("id", userId)
      .maybeSingle();
    if (userErr) log.error("users lookup failed", userErr, { userId });
    if (!userRow?.city_id || !STAFF_ROLES.has(userRow.role)) return "/";

    const { data: city, error: cityErr } = await db
      .from("cities")
      .select("slug")
      .eq("id", userRow.city_id)
      .maybeSingle();
    if (cityErr) log.error("city lookup failed", cityErr, { userId });
    if (!city?.slug) return "/";

    return `/city/${city.slug}`;
  } catch (err) {
    log.error("resolveAuthHome threw", err, { userId });
    return "/";
  }
}
