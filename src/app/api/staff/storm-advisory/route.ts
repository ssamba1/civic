import { NextResponse } from "next/server";
import { createSSRClient, getAuthUser } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";
import { getCachedAdvisory, setCachedAdvisory } from "@/lib/weather/cache";
import { buildStormAdvisory } from "@/lib/weather/storm-advisory";

const logger = createLogger("[storm-advisory]");

export async function GET() {
  try {
    // Auth: any staff role may view this (mirrors impact-export's role check).
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
        !["staff_dispatcher", "staff_supervisor", "admin"].includes(profile.role)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const cached = getCachedAdvisory();
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": "private, max-age=60" } });
    }

    const advisory = await buildStormAdvisory();
    setCachedAdvisory(advisory);

    return NextResponse.json(advisory, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (err) {
    logger.error("storm_advisory_failed", err);
    return NextResponse.json({ error: "Failed to build storm advisory" }, { status: 500 });
  }
}
