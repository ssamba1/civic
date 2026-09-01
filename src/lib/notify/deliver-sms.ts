import "server-only";

import { createLogger } from "@/lib/logger";
import type { DeliveryResult } from "@/lib/notify/deliver";

/* ==================================================================
   Notification delivery, the SMS leg (NEXT_100 #1 / #2).

   The email leg (deliver.ts) reaches inboxes; SMS reaches the residents who
   never open email, seniors, low-income, feature-phone users. Dependency-free
   Twilio REST call (no SDK), env-gated, with a log fallback so demo builds SHOW
   intent without credentials.

   Config (all optional, absent → log-only no-op, never throws):
     TWILIO_ACCOUNT_SID   enables real sending
     TWILIO_AUTH_TOKEN    Basic-auth secret
     TWILIO_FROM_NUMBER   verified sender in E.164 (e.g. +14045551234)
     NOTIFY_DISABLE=1     force log-only even when creds are present

   Channel policy: SMS is the short, link-carrying companion to the email
   close-the-loop notices. Reporters with no phone → callers pass `to: null`
   and this no-ops. Keep bodies short, one sentence + the status link.
   ================================================================== */

const logger = createLogger("[notify-sms]");

export interface SmsMessage {
  /** Recipient in E.164. `null`/empty → skip (no phone on file). */
  to: string | null | undefined;
  /** Plain-text body; keep it to ~1 segment. A status link may be appended. */
  body: string;
}

/**
 * Send one SMS via Twilio. Never throws. Returns a result the caller can log.
 * Absent recipient/creds/flag degrades to a console line so demo builds still
 * show what would have been delivered.
 */
export async function deliverSms(m: SmsMessage): Promise<DeliveryResult> {
  if (!m.to) return { sent: false, reason: "no-recipient" };
  if (process.env.NOTIFY_DISABLE === "1") {
    logger.info("SMS delivery disabled by environment");
    return { sent: false, reason: "disabled" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    logger.info("SMS delivery skipped (Twilio not configured)", {
      preview: m.body.slice(0, 60),
    });
    return { sent: false, reason: "no-key" };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: m.to, From: from, Body: m.body }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error("SMS send failed", new Error(`Twilio ${res.status}`), {
        detail: detail.slice(0, 200),
      });
      return { sent: false, reason: "send-error" };
    }
    return { sent: true, reason: "ok" };
  } catch (err) {
    logger.error("SMS send threw exception", err);
    return { sent: false, reason: "send-error" };
  }
}
