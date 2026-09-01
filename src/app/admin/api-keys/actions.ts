"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod/v4";
import { requireAdminScope } from "@/lib/auth/admin-scope";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";
import {
  API_KEY_SCOPES,
  mintApiKey,
  revokeApiKey,
} from "@/lib/open311/admin-keys";
import type { Result } from "@/lib/types";

// Server Actions are public endpoints. Re-check authorization here, never rely
// on the layout gate alone. Mirrors admin/onboard/actions.ts requireAdmin, but
// returns the resolved admin user id so a minted key can attribute to a real
// users row by default (the FK on api_keys.user_id, migration 028).
async function resolveAdminUserId(): Promise<string | null> {
  if (DEMO_MODE) {
    const demo = findVerifiedDemoAccount(
      (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
    );
    // Demo has no real users row; fall through to the env system user so a
    // (doomed) FK insert at least targets a real id in a mixed local setup.
    if (demo?.role === "admin") {
      return process.env.OPEN311_SYSTEM_USER_ID ?? null;
    }
  }
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  const user = await getAuthUser();
  if (!user)
    return devBypass ? (process.env.OPEN311_SYSTEM_USER_ID ?? null) : null;
  const db = createServerClient();
  const { data } = await db
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  return data?.role === "admin" ? user.id : null;
}

const mintSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(80),
  cityId: z.string().uuid().nullable(),
  // Default attribution: the issuing admin. An explicit partner users.id can be
  // supplied to attribute reports to a dedicated partner account instead.
  userId: z.string().uuid().nullable(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, "Pick at least one scope"),
});

export async function createApiKeyAction(input: {
  label: string;
  cityId: string | null;
  userId: string | null;
  scopes: string[];
}): Promise<Result<{ id: string; plaintext: string }>> {
  const adminId = await resolveAdminUserId();
  if (!adminId) return { ok: false, error: "unauthorized" };

  const parsed = mintSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }

  // Scope the key to the acting admin's OWN city. parsed.data.cityId is
  // caller-supplied and was written through unchecked, so an admin of one city
  // could mint a working Open311 key scoped to another.
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const result = await mintApiKey({
    label: parsed.data.label,
    userId: parsed.data.userId ?? adminId,
    cityId: admin.cityId,
    scopes: parsed.data.scopes,
  });
  if (result.ok) revalidatePath("/admin/api-keys");
  return result;
}

export async function revokeApiKeyAction(id: string): Promise<Result<void>> {
  const adminId = await resolveAdminUserId();
  if (!adminId) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  // Ownership check before the revoke. revokeApiKey() matches on id alone and
  // runs service-role, so without this any admin could revoke another city's
  // integration key and silently break their Open311 feed.
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };
  const db = createServerClient();
  const { data: key } = await db
    .from("api_keys")
    .select("id")
    .eq("id", parsed.data)
    .eq("city_id", admin.cityId)
    .maybeSingle<{ id: string }>();
  if (!key) return { ok: false, error: "not_found" };

  const result = await revokeApiKey(parsed.data);
  if (result.ok) revalidatePath("/admin/api-keys");
  return result;
}
