"use server";

import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { REQUEST_KIND_VALUES, type RequestInput } from "@/lib/requests/types";
import type { Result } from "@/lib/types";

const logger = createLogger("[requests]");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Inbound request from a city/user asking for a feature, QoL tweak, or setup
// help. Public (anonymous) and signed-in submissions both allowed; writes run
// through the service-role client because feature_requests is RLS default-deny.
export async function submitRequest(
  input: RequestInput,
): Promise<Result<{ id: string }>> {
  const kind = input.kind;
  const title = input.title?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  const email = input.email?.trim() || null;
  const cityName = input.cityName?.trim() || null;
  const source = input.source?.trim() || null;

  if (!REQUEST_KIND_VALUES.includes(kind))
    return { ok: false, error: "invalid_kind" };
  if (title.length < 1 || title.length > 160)
    return { ok: false, error: "invalid_title" };
  if (body.length < 1 || body.length > 4000)
    return { ok: false, error: "invalid_body" };
  if (email && (email.length > 254 || !EMAIL_RE.test(email)))
    return { ok: false, error: "invalid_email" };

  // Attribute to the signed-in user when there is one; anonymous otherwise.
  const user = await getAuthUser();
  const userId = user && !user.is_anonymous ? user.id : null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .insert({
      kind,
      title,
      body,
      email,
      city_name: cityName,
      source: source?.slice(0, 120) ?? null,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("Insert failed", error);
    return { ok: false, error: "submit_failed" };
  }

  return { ok: true, data: { id: data.id } };
}
