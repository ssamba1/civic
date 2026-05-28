import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/db/ssr-client";

export async function POST(request: Request) {
  const supabase = await createSSRClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
