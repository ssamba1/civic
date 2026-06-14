import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/db/ssr-client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const errorParam = url.searchParams.get("error_description");

  if (errorParam) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", errorParam);
    return NextResponse.redirect(back);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = await createSSRClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", error.message);
    return NextResponse.redirect(back);
  }

  // Validate redirect destination: only allow local paths that don't redirect to another domain.
  // Reject protocol-relative URLs (//evil.com) and absolute URLs (https://evil.com).
  let safeNext = "/";
  if (next.startsWith("/") && !next.startsWith("//")) {
    try {
      // Verify the destination stays on the same origin
      const nextUrl = new URL(next, url.origin);
      if (nextUrl.origin === url.origin) {
        safeNext = next;
      }
    } catch {
      // Invalid URL, stay on homepage
    }
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
