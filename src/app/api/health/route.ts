import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { database: false, ai: false };
  let status: "ok" | "degraded" | "error" = "ok";

  // Check Supabase connection
  try {
    const db = createServerClient();
    const { error } = await db.from("reports").select("id").limit(1);
    checks.database = !error;
    if (error) status = "degraded";
  } catch {
    status = "degraded";
  }

  // Check Gemini API key is configured
  try {
    checks.ai = Boolean(process.env.GEMINI_API_KEY);
    if (!checks.ai) status = "degraded";
  } catch {
    status = "degraded";
  }

  if (!checks.database && !checks.ai) status = "error";

  const body = {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: status === "error" ? 503 : 200,
  });
}
