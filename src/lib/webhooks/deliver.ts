// Webhook delivery — POST to registered endpoints with HMAC signature header.
// Retries up to 3 times with exponential backoff (adapted from ai/retry pattern).
// Gracefully degrades: delivery failures are logged but never throw to callers.

import { createServerClient } from "@/lib/db/client";
import { createLogger } from "@/lib/logger";
import type { WebhookEventType, WebhookPayload, WebhookReportPayload } from "./dispatch";
import { buildWebhookPayload, signPayload } from "./dispatch";

const logger = createLogger("[webhooks]");

/** Registered endpoint row from the DB. */
export interface WebhookEndpoint {
  id: string;
  city_id: string | null;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

/** Deliver a single payload to one URL with retries. Returns ok/error. */
async function deliverOne(
  url: string,
  payload: WebhookPayload,
  signature: string,
  retries = 3,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "X-Civic-Signature": signature,
    "X-Civic-Event": payload.event,
    "User-Agent": "civic-webhooks/1",
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, status: res.status };
      // 4xx = caller error; don't retry (except 429)
      if (res.status !== 429 && res.status < 500) {
        return { ok: false, status: res.status, error: `http_${res.status}` };
      }
      // 429 / 5xx: retryable
    } catch (err) {
      // Network error — retryable
      if (attempt >= retries) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (attempt < retries) {
      const backoff = 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
      await new Promise<void>((r) => setTimeout(r, backoff));
    }
  }
  return { ok: false, error: "max_retries" };
}

/** Load active endpoints for a given city that subscribe to this event. */
async function loadEndpoints(
  event: WebhookEventType,
  cityId: string | null,
): Promise<WebhookEndpoint[]> {
  try {
    const db = createServerClient();
    // Match endpoints where: active=true AND (city_id matches OR city_id is null)
    // AND event is in the events array.
    let query = db
      .from("webhook_endpoints")
      .select("id, city_id, url, secret, events, active")
      .eq("active", true)
      .contains("events", [event]);

    if (cityId) {
      // endpoints scoped to this city OR global (null city_id)
      query = query.or(`city_id.eq.${cityId},city_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      logger.error("Failed to load webhook endpoints", error);
      return [];
    }
    return (data ?? []) as WebhookEndpoint[];
  } catch (err) {
    logger.error("Webhook endpoint load threw", err);
    return [];
  }
}

/**
 * Emit a webhook event to all registered, active endpoints for the city.
 * Fire-and-forget safe: catches all errors internally.
 */
export async function emitWebhook(
  event: WebhookEventType,
  report: WebhookReportPayload,
): Promise<void> {
  let endpoints: WebhookEndpoint[];
  try {
    endpoints = await loadEndpoints(event, report.city_id);
  } catch {
    return; // DB absent or error — graceful degrade
  }

  if (endpoints.length === 0) return;

  const payload = buildWebhookPayload(event, report);

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const sig = signPayload(payload, ep.secret);
      const result = await deliverOne(ep.url, payload, sig);
      if (!result.ok) {
        logger.warn(`Webhook delivery failed for endpoint ${ep.id}`, result);
      } else {
        // Strip query string from logged URL to avoid leaking secrets/tokens.
        let safeUrl = ep.url;
        try {
          const u = new URL(ep.url);
          safeUrl = u.origin + u.pathname;
        } catch {
          // unparseable — log as-is (already a non-sensitive fallback)
        }
        logger.info(`Webhook delivered to ${ep.id} (${safeUrl})`);
      }
    }),
  );
}
