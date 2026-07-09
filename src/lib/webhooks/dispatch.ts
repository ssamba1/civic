// Webhook dispatch helpers (NEXT_100 #79)
// Pure functions: buildWebhookPayload + signPayload.
// No DB deps — safe to import in both server and test contexts.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReportStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Stable public event schema (v1). Do NOT change field names — partners depend
// on this shape. Additive changes only; document removals in a major bump.
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "report.created"
  | "report.status_changed"
  | "report.closed";

export interface WebhookReportPayload {
  id: string;
  city_id: string | null;
  category: string;
  status: ReportStatus;
  severity: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string | null;
  /** Present on report.status_changed and report.closed. */
  previous_status?: ReportStatus;
}

export interface WebhookPayload {
  /** Schema version — increment only on breaking changes. */
  schema_version: 1;
  event: WebhookEventType;
  timestamp: string; // ISO-8601 UTC
  report: WebhookReportPayload;
}

/** Build the canonical webhook payload. `timestamp` defaults to now. */
export function buildWebhookPayload(
  event: WebhookEventType,
  report: WebhookReportPayload,
  timestamp?: string,
): WebhookPayload {
  return {
    schema_version: 1,
    event,
    timestamp: timestamp ?? new Date().toISOString(),
    report,
  };
}

/**
 * HMAC-SHA256 signature. Returns the hex digest.
 * Consumers verify by computing the same HMAC over the raw body bytes
 * and comparing with `X-Civic-Signature` in constant time.
 */
export function signPayload(payload: WebhookPayload, secret: string): string {
  const body = JSON.stringify(payload);
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Verify an inbound signature (for partners that ping Civic back).
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifySignature(
  payload: WebhookPayload,
  secret: string,
  receivedHex: string,
): boolean {
  const expected = Buffer.from(signPayload(payload, secret), "hex");
  let received: Buffer;
  try {
    received = Buffer.from(receivedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
