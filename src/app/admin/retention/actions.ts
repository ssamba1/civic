"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { DEMO_SESSION_COOKIE, findDemoAccount } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { getAuthUser } from "@/lib/db/ssr-client";
import type { Result } from "@/lib/types";
import {
  type RetentionInput,
  type RetentionSettings,
  validateRetention,
} from "./validate";

export type { RetentionInput, RetentionSettings } from "./validate";

// ─── auth guard ──────────────────────────────────────────────────────────────

async function requireAdmin(): Promise<boolean> {
  if (DEMO_MODE) {
    const demo = findDemoAccount(
      (await cookies()).get(DEMO_SESSION_COOKIE)?.value,
    );
    if (demo?.role === "admin") return true;
  }
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";
  const user = await getAuthUser();
  if (!user) return devBypass;
  const db = createServerClient();
  const { data } = await db
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  return data?.role === "admin";
}

// ─── server actions ──────────────────────────────────────────────────────────

export async function getRetentionSettings(
  cityId: string,
): Promise<Result<RetentionSettings>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(cityId);
  if (!parsed.success) return { ok: false, error: "invalid_city_id" };

  const db = createServerClient();
  const { data, error } = await db
    .from("retention_settings")
    .select("*")
    .eq("city_id", parsed.data)
    .maybeSingle<RetentionSettings>();

  if (error) return { ok: false, error: error.message };

  // Return defaults when no row exists yet.
  if (!data) {
    return {
      ok: true,
      data: {
        id: "",
        city_id: cityId,
        raw_photo_ttl_days: 30,
        freetext_ttl_days: 365,
        updated_at: new Date().toISOString(),
      },
    };
  }
  return { ok: true, data };
}

export async function updateRetentionSettings(
  cityId: string,
  input: RetentionInput,
): Promise<Result<RetentionSettings>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const cityParsed = z.string().uuid().safeParse(cityId);
  if (!cityParsed.success) return { ok: false, error: "invalid_city_id" };

  const validation = validateRetention(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const db = createServerClient();
  const { data, error } = await db
    .from("retention_settings")
    .upsert(
      {
        city_id: cityParsed.data,
        raw_photo_ttl_days: validation.data.raw_photo_ttl_days,
        freetext_ttl_days: validation.data.freetext_ttl_days,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "city_id" },
    )
    .select("*")
    .single<RetentionSettings>();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "no_data_returned" };

  revalidatePath("/admin/retention");
  return { ok: true, data };
}
