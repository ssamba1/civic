import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import {
  DEMO_CITY,
  DEMO_SESSION_COOKIE,
  findDemoAccount,
} from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";

const log = createLogger("[auth/admin-scope]");

/** The acting admin plus the single city they are allowed to act on. */
export interface AdminScope {
  /** Empty string for the demo/dev-bypass personas, which have no real user row. */
  adminId: string;
  cityId: string;
}

/**
 * Resolve the acting admin AND the city they administer.
 *
 * Every admin surface must scope its reads and writes to `cityId`. The older
 * `requireAdmin(): Promise<boolean>` shape in several action files answered
 * only "is this user an admin *somewhere*", which is not an authorization
 * decision in a multi-tenant product: it let an admin of city A delete city B's
 * webhooks, silence city B's automation rules, revoke city B's API keys and
 * rewrite city B's photo-retention policy. Those actions all run through the
 * service-role client, which bypasses RLS, so the city check has to happen here
 * in application code — the database will not catch it.
 *
 * Returns null when the caller is not an admin, or is an admin with no city.
 */
export async function requireAdminScope(): Promise<AdminScope | null> {
  const db = createServerClient();

  if (DEMO_MODE) {
    const demo = findDemoAccount(
      (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
    );
    if (demo?.role === "admin") {
      const cityId = await cityIdForSlug(DEMO_CITY);
      return cityId ? { adminId: "", cityId } : null;
    }
  }

  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  if (devBypass) {
    // No acting user in bypass mode — pin to the demo city so the scope is
    // still a real, single tenant rather than "all of them".
    const cityId = (await cityIdForSlug(DEMO_CITY)) ?? (await firstCityId());
    return cityId ? { adminId: "", cityId } : null;
  }

  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await db
    .from("users")
    .select("role, city_id")
    .eq("id", user.id)
    .maybeSingle<{ role: string; city_id: string | null }>();

  if (error) {
    log.error("admin role check failed", error, { userId: user.id });
    return null;
  }
  if (data?.role !== "admin" || !data.city_id) return null;
  return { adminId: user.id, cityId: data.city_id };
}

async function cityIdForSlug(slug: string): Promise<string | null> {
  const { data } = await createServerClient()
    .from("cities")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function firstCityId(): Promise<string | null> {
  const { data } = await createServerClient()
    .from("cities")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
