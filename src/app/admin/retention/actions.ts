"use server";

import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/auth/admin-scope";
import { createServerClient } from "@/lib/db/client";
import type { Result } from "@/lib/types";
import {
  type RetentionInput,
  type RetentionSettings,
  validateRetention,
} from "./validate";

export type { RetentionInput, RetentionSettings } from "./validate";

// ─── server actions ──────────────────────────────────────────────────────────

/**
 * Read the retention policy for the acting admin's OWN city.
 *
 * The cityId parameter is gone on purpose. It was caller-supplied and never
 * checked against the admin's own city, so an admin of one city could read —
 * and, through updateRetentionSettings, rewrite — another city's raw-photo TTL,
 * which is a privacy control.
 */
export async function getRetentionSettings(): Promise<
  Result<RetentionSettings>
> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };
  const cityId = admin.cityId;

  const db = createServerClient();
  const { data, error } = await db
    .from("retention_settings")
    .select("*")
    .eq("city_id", cityId)
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

/** Write the retention policy for the acting admin's OWN city. */
export async function updateRetentionSettings(
  input: RetentionInput,
): Promise<Result<RetentionSettings>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const validation = validateRetention(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const db = createServerClient();
  const { data, error } = await db
    .from("retention_settings")
    .upsert(
      {
        city_id: admin.cityId,
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
