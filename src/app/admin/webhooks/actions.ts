"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod/v4";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE, findDemoAccount } from "@/lib/demo-auth";
import { DEMO_MODE } from "@/lib/demo-mode";
import type { Result } from "@/lib/types";

// Mirror the requireAdmin pattern from admin/onboard/actions.ts
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

const VALID_EVENTS = [
  "report.created",
  "report.status_changed",
  "report.closed",
] as const;

const registerSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.url("Must be a valid HTTPS URL").refine(
    (u) => u.startsWith("https://"),
    { message: "Webhook URL must use HTTPS" },
  ),
  cityId: z.string().uuid().nullable(),
  events: z
    .array(z.enum(VALID_EVENTS))
    .min(1, "Select at least one event"),
});

export interface WebhookEndpointRow {
  id: string;
  label: string | null;
  url: string;
  city_id: string | null;
  events: string[];
  active: boolean;
  created_at: string;
}

export async function registerWebhookAction(input: {
  label: string;
  url: string;
  cityId: string | null;
  events: string[];
}): Promise<Result<{ id: string; secret: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }

  // Generate a random secret — shown once to the admin
  const secret = `whsec_${randomBytes(32).toString("hex")}`;

  const db = createServerClient();
  const { data, error } = await db
    .from("webhook_endpoints")
    .insert({
      label: parsed.data.label,
      url: parsed.data.url,
      city_id: parsed.data.cityId,
      events: parsed.data.events,
      secret,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  revalidatePath("/admin/webhooks");
  return { ok: true, data: { id: data.id as string, secret } };
}

export async function deleteWebhookAction(
  id: string,
): Promise<Result<void>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  const db = createServerClient();
  const { error } = await db
    .from("webhook_endpoints")
    .delete()
    .eq("id", parsed.data);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/webhooks");
  return { ok: true, data: undefined };
}

export async function toggleWebhookAction(
  id: string,
  active: boolean,
): Promise<Result<void>> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  const db = createServerClient();
  const { error } = await db
    .from("webhook_endpoints")
    .update({ active })
    .eq("id", parsed.data);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/webhooks");
  return { ok: true, data: undefined };
}

export async function listWebhooksAction(): Promise<
  Result<WebhookEndpointRow[]>
> {
  if (!(await requireAdmin())) return { ok: false, error: "unauthorized" };

  const db = createServerClient();
  const { data, error } = await db
    .from("webhook_endpoints")
    .select("id, label, url, city_id, events, active, created_at")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as WebhookEndpointRow[] };
}
