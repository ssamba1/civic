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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Create Supabase client for SSR session checking
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

    // Check admin role in user metadata
    const role = user.user_metadata?.role ?? user.app_metadata?.role;
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
