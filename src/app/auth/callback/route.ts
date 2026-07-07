import { NextResponse } from "next/server";
import { resolveAuthHome } from "@/lib/auth-home";
import { createSSRClient } from "@/lib/db/ssr-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth-callback");

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

  // No explicit destination was requested (or it failed validation) — route
  // staff straight to their city console instead of always landing on "/".
  if (safeNext === "/") {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    // Landing on "/" is a safe fallback, but never a silent one — an error
    // here means staff quietly stop reaching their console after sign-in.
    if (userErr) log.error("getUser failed post-exchange", userErr);
    if (user) {
      safeNext = await resolveAuthHome(user.id);
    }
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
