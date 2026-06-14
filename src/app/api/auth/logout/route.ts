import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[logout-api]");

export async function POST(request: Request) {
  try {
    const supabase = await createSSRClient();
    await supabase.auth.signOut();
  } catch (err) {
    logger.error("Logout failed", err);
  }
  // Redirect regardless — logout always succeeds from user perspective
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
