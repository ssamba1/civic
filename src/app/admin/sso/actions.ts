"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE, findDemoAccount } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import { parseSamlConfig } from "@/lib/auth/sso";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";

const log = createLogger("admin-sso-actions");

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
  if (devBypass) return true;

  const user = await getAuthUser();
  if (!user) return false;
  const db = createServerClient();
  const { data } = await db
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  return data?.role === "admin";
}

export interface SsoConfigRow {
  id: string;
  city_id: string | null;
  entity_id: string;
  sso_url: string;
  email_domain: string;
  active: boolean;
  created_at: string;
}

export async function listSsoConfigsAction(): Promise<Result<SsoConfigRow[]>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const db = createServerClient();
  const { data, error } = await db
    .from("sso_configs")
    .select("id, city_id, entity_id, sso_url, email_domain, active, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    log.error("listSsoConfigsAction query failed", error);
    return { ok: false, error: "db_error" };
  }
  return { ok: true, data: (data ?? []) as SsoConfigRow[] };
}

export async function saveSsoConfigAction(input: {
  entityId: string;
  ssoUrl: string;
  x509cert: string;
  domain: string;
  cityId: string | null;
}): Promise<Result<{ id: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const validated = parseSamlConfig(input);
  if (!validated.ok) return validated;

  const cfg = validated.data;
  const db = createServerClient();

  // Upsert on email_domain (unique) so re-saving updates the cert/url
  const { data, error } = await db
    .from("sso_configs")
    .upsert(
      {
        entity_id: cfg.entityId,
        sso_url: cfg.ssoUrl,
        x509cert: cfg.x509cert,
        email_domain: cfg.domain,
        city_id: cfg.cityId ?? null,
        active: cfg.active ?? true,
      },
      { onConflict: "email_domain" },
    )
    .select("id")
    .single();

  if (error || !data) {
    if (error) log.error("saveSsoConfigAction upsert failed", error);
    return { ok: false, error: "db_error" };
  }

  revalidatePath("/admin/sso");
  return { ok: true, data: { id: data.id as string } };
}

export async function deleteSsoConfigAction(id: string): Promise<Result<void>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  const db = createServerClient();
  const { error } = await db.from("sso_configs").delete().eq("id", parsed.data);
  if (error) {
    log.error("deleteSsoConfigAction failed", error, { id });
    return { ok: false, error: "db_error" };
  }

  revalidatePath("/admin/sso");
  return { ok: true, data: undefined };
}
