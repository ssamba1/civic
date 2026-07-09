import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { drainUndelivered } from "@/lib/notify/outbox";

const logger = createLogger("[notify-drain]");

/**
 * Undelivered-notification drain (LCP-05). Retries the email leg for resolution
 * notifications whose synchronous send never landed (Resend 5xx / network blip),
 * so a transient failure at close time doesn't silently lose a resident's
 * resolution email. Idempotent — a delivered or terminally-failed row drops out
 * of future scans (see lib/notify/outbox.ts).
 *
 * Auth mirrors sla-escalate exactly: a shared NOTIFY_CRON_SECRET bearer token
 * for a headless systemd timer / external cron, OR a staff/admin session for a
 * manual "flush now" from the app.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`notify_drain:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const cronSecret = process.env.NOTIFY_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronOk = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!cronOk) {
    const isDev = process.env.NODE_ENV === "development";
    const devBypass = isDev && process.env.DEV_AUTH_BYPASS === "1";
    if (!devBypass) {
      const user = await getAuthUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const ssr = await createSSRClient();
      const { data: profile } = await ssr
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (
        !profile ||
        !["staff_dispatcher", "staff_supervisor", "admin"].includes(
          profile.role,
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  try {
    const summary = await drainUndelivered();
    return NextResponse.json(summary);
  } catch (err) {
    logger.error("notify_drain_threw", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
