"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdminScope } from "@/lib/auth/admin-scope";
import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { Result } from "@/lib/types";
import { isBlockedWebhookHost } from "@/lib/webhooks/url-guard";

const logger = createLogger("[webhooks/actions]");

const VALID_EVENTS = [
  "report.created",
  "report.status_changed",
  "report.closed",
] as const;

const registerSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z
    .url("Must be a valid HTTPS URL")
    .refine((u) => u.startsWith("https://"), {
      message: "Webhook URL must use HTTPS",
    }),
  events: z.array(z.enum(VALID_EVENTS)).min(1, "Select at least one event"),
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

/**
 * Register a webhook endpoint for the acting admin's OWN city. There is
 * deliberately no cityId parameter: the previous signature took one from the
 * client and wrote it straight through, which let an admin of one city register
 * (and then read back) endpoints belonging to another.
 */
export async function registerWebhookAction(input: {
  label: string;
  url: string;
  events: string[];
}): Promise<Result<{ id: string; secret: string }>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid_input",
    };
  }

  // SSRF guard: reject URLs pointing at internal/private hosts.
  // DNS-rebinding is a residual risk (the hostname could resolve to a private IP
  // after this check), acceptable for MVP.
  try {
    const { hostname } = new URL(parsed.data.url);
    if (isBlockedWebhookHost(hostname)) {
      return { ok: false, error: "url_not_allowed" };
    }
  } catch {
    return { ok: false, error: "url_not_allowed" };
  }

  // Generate a random secret, shown once to the admin
  const secret = `whsec_${randomBytes(32).toString("hex")}`;

  const db = createServerClient();
  const { data, error } = await db
    .from("webhook_endpoints")
    .insert({
      label: parsed.data.label,
      url: parsed.data.url,
      // Never the caller-supplied cityId. An admin may only write to their own city.
      city_id: admin.cityId,
      events: parsed.data.events,
      secret,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("webhook register db error", error);
    return { ok: false, error: "db_error" };
  }

  revalidatePath("/admin/webhooks");
  return { ok: true, data: { id: data.id as string, secret } };
}

export async function deleteWebhookAction(id: string): Promise<Result<void>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  const db = createServerClient();
  const { error } = await db
    .from("webhook_endpoints")
    .delete()
    .eq("id", parsed.data)
    .eq("city_id", admin.cityId);

  if (error) {
    logger.error("webhook delete db error", error);
    return { ok: false, error: "db_error" };
  }
  revalidatePath("/admin/webhooks");
  return { ok: true, data: undefined };
}

export async function toggleWebhookAction(
  id: string,
  active: boolean,
): Promise<Result<void>> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  const db = createServerClient();
  const { error } = await db
    .from("webhook_endpoints")
    .update({ active })
    .eq("id", parsed.data)
    .eq("city_id", admin.cityId);

  if (error) {
    logger.error("webhook toggle db error", error);
    return { ok: false, error: "db_error" };
  }
  revalidatePath("/admin/webhooks");
  return { ok: true, data: undefined };
}

export async function listWebhooksAction(): Promise<
  Result<WebhookEndpointRow[]>
> {
  const admin = await requireAdminScope();
  if (!admin) return { ok: false, error: "unauthorized" };

  const db = createServerClient();
  const { data, error } = await db
    .from("webhook_endpoints")
    .select("id, label, url, city_id, events, active, created_at")
    .eq("city_id", admin.cityId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("webhook list db error", error);
    return { ok: false, error: "db_error" };
  }
  return { ok: true, data: (data ?? []) as WebhookEndpointRow[] };
}
