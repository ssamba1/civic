import { NextResponse } from "next/server";
import { computeDrift } from "@/lib/ai/drift-monitor";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";

/* Classification drift metric (#37). Staff/admin or DRIFT_CRON_SECRET bearer.
   GET returns the recent-vs-prior override rate; a cron can poll and alert on
   `alert: true`. */
export async function GET(request: Request) {
  const rl = checkRateLimit(`drift:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const secret = process.env.DRIFT_CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronOk = !!secret && authHeader === `Bearer ${secret}`;
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";

  if (!cronOk && !devBypass) {
    const user = await getAuthUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ssr = await createSSRClient();
    const { data: profile } = await ssr
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      !profile ||
      !["staff_dispatcher", "staff_supervisor", "admin"].includes(profile.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const metric = await computeDrift();
  return NextResponse.json(metric);
}
