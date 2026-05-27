import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/report",
  "/offline",
];

const PUBLIC_PREFIXES = [
  "/city/",
  "/api/open311/",
  "/api/health",
  "/_next/",
  "/icons/",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always create the Supabase client and call getUser() so that the auth
  // session cookies are refreshed on every request — including public routes.
  // Skipping this for public routes would let sessions expire silently.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // M1 fix: getUser() refreshes the session cookie as a side effect.
  // Must run before any early return so public-route visitors keep their sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow public routes through — but return `response` (not NextResponse.next())
  // so any refreshed cookies set above are forwarded to the browser.
  if (isPublicRoute(pathname)) {
    return response;
  }

  // Protected: /staff/* — require authenticated user
  if (pathname.startsWith("/staff/") && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protected: /admin/* — require admin role
  if (pathname.startsWith("/admin/")) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // C7 fix: read role ONLY from app_metadata (server-writable via Supabase Admin API).
    // Never trust user_metadata — any authenticated user can write it via
    // supabase.auth.updateUser() and self-promote to admin.
    const role = user.app_metadata?.role;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and images.
     * Next.js internals (_next/static, _next/image, favicon) are excluded.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
