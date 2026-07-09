import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ai/rate-limit";
import { createSSRClient } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[logout-api]");

export async function POST(request: Request) {
  const rl = checkRateLimit(`logout:${clientIp(request)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  try {
    const supabase = await createSSRClient();
    await supabase.auth.signOut();
  } catch (err) {
    logger.error("Logout failed", err);
  }
  // Redirect regardless — logout always succeeds from user perspective
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
