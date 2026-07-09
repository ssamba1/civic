import "server-only";

import { createLogger } from "@/lib/logger";

/* ==================================================================
   Outbound webhooks (NEXT_100 #79).

   Lets a city wire Civic status changes into Zapier/Make/n8n or their own
   endpoint without us building a connector per system (Wedge W5: integrate,
   don't replace). Dependency-free POST to each configured endpoint.

   Config (optional — absent → no-op, never throws):
     WEBHOOK_ENDPOINTS   comma-separated absolute URLs
     WEBHOOK_SECRET      optional shared secret sent as X-Civic-Signature
     NOTIFY_DISABLE=1    force no-op (shared with the notify layer)
   ================================================================== */

const logger = createLogger("[webhooks-out]");
const TIMEOUT_MS = 5000;

export interface WebhookEvent {
  /** Event name, e.g. "report.closed". */
  event: string;
  reportId: string;
  status: string;
  category?: string | null;
  occurredAt: string;
}

function endpoints(): string[] {
  return (process.env.WEBHOOK_ENDPOINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
}

/**
 * Fire an event to every configured endpoint. Best-effort and fully parallel;
 * a failing endpoint is logged and never affects the others or the caller.
 * Returns the count actually delivered (useful in tests/telemetry).
 */
export async function fireWebhook(evt: WebhookEvent): Promise<number> {
  if (process.env.NOTIFY_DISABLE === "1") return 0;
  const urls = endpoints();
  if (urls.length === 0) return 0;

  const secret = process.env.WEBHOOK_SECRET;
  const body = JSON.stringify(evt);

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret ? { "X-Civic-Signature": secret } : {}),
          },
          body,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  let delivered = 0;
  for (const r of results) {
    if (r.status === "fulfilled") delivered++;
    else logger.warn("webhook_delivery_failed", { detail: String(r.reason) });
  }
  return delivered;
}
