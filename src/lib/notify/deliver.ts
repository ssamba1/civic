import "server-only";

/* ==================================================================
   Notification delivery — the out-of-band channel.

   Open311 GeoReport v2 has no push/webhooks, so the notification layer is ours
   to own. This is the email leg: a dependency-free Resend REST call (no SDK),
   env-gated, with a log fallback so demo builds SHOW intent without a key.

   Config (all optional — absent → log-only no-op, never throws):
     RESEND_API_KEY     enables real sending
     NOTIFY_FROM_EMAIL  verified sender (default: a placeholder)
     NOTIFY_DISABLE=1   force log-only even when a key is present

   Channel policy: email is the durable, attachment-capable channel for the
   close-the-loop notifications (received / acknowledged / resolved). Anonymous
   reporters have no email — callers pass `to: null` and this no-ops the email
   leg; their channel is the in-app feed + (future) tokenized status page.
   ================================================================== */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface EmailMessage {
  /** Recipient. `null`/empty → skip (e.g. anonymous reporter with no email). */
  to: string | null | undefined;
  subject: string;
  /** Bold lead line inside the email body. */
  heading: string;
  /** One or two short paragraphs of plain text. */
  body: string;
  /** Optional resolution ("after") photo — the operational-transparency lever. */
  photoUrl?: string | null;
  /** Optional deep link back to the report's status page. */
  reportUrl?: string | null;
}

export interface DeliveryResult {
  sent: boolean;
  reason?: "no-recipient" | "disabled" | "no-key" | "send-error" | "ok";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(m: EmailMessage): string {
  const photo = m.photoUrl
    ? `<img src="${escapeHtml(m.photoUrl)}" alt="" style="display:block;width:100%;max-width:520px;border-radius:12px;margin:16px 0;" />`
    : "";
  const cta = m.reportUrl
    ? `<a href="${escapeHtml(m.reportUrl)}" style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px;margin-top:8px;">View your report</a>`
    : "";
  return [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#18181b;">`,
    `<h1 style="font-size:18px;margin:0 0 8px;">${escapeHtml(m.heading)}</h1>`,
    `<p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0;">${escapeHtml(m.body)}</p>`,
    photo,
    cta,
    `<p style="font-size:12px;color:#a1a1aa;margin-top:24px;">Civic · you're receiving this because you reported an issue.</p>`,
    `</div>`,
  ].join("");
}

/**
 * Send one notification email. Never throws — returns a result the caller can
 * log. Absent recipient/key/flag degrades to a console line so demo builds
 * still show what *would* have been delivered.
 */
export async function deliverEmail(m: EmailMessage): Promise<DeliveryResult> {
  if (!m.to) return { sent: false, reason: "no-recipient" };
  if (process.env.NOTIFY_DISABLE === "1") {
    console.info(`[notify] (disabled) would email ${m.to}: ${m.subject}`);
    return { sent: false, reason: "disabled" };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[notify] (no key) would email ${m.to}: ${m.subject}`);
    return { sent: false, reason: "no-key" };
  }

  const from = process.env.NOTIFY_FROM_EMAIL ?? "Civic <notify@civic.local>";
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: m.to,
        subject: m.subject,
        html: renderHtml(m),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[notify] resend ${res.status}: ${detail.slice(0, 200)}`);
      return { sent: false, reason: "send-error" };
    }
    return { sent: true, reason: "ok" };
  } catch (err) {
    console.error(
      `[notify] send threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { sent: false, reason: "send-error" };
  }
}
