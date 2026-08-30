import { Building2, LogOut } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileNav, SidebarNav } from "@/components/admin/sidebar-nav";
import { ToastProvider } from "@/components/ui/toast";
import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-auth";
import { findVerifiedDemoAccount } from "@/lib/demo-cookie";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createLogger } from "@/lib/logger";

const logger = createLogger("[admin-layout]");

// Onboarding is operator-only. Gate on the admin role (UI §11 decision 5:
// admin + allowlist for v1). Mirrors the staff layout's auth pattern.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  // Client-supplied cookie: honor it only in demo mode, and only for the admin
  // persona — team/resident personas must not reach tenant provisioning (T0.1).
  const demoCookieAccount = DEMO_MODE
    ? findVerifiedDemoAccount((await cookies()).get(DEMO_SESSION_COOKIE)?.value)
    : null;
  const demoAccount =
    demoCookieAccount?.role === "admin" ? demoCookieAccount : null;
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";

  if (!user && !demoAccount && !devBypass) {
    redirect("/login?redirect=/admin/cities");
  }

  const supabase = createServerClient();
  let profile:
    | { id: string; role: string; display_name: string | null }
    | null
    | undefined;

  if (demoAccount) {
    profile = {
      id: demoAccount.username,
      role: "admin",
      display_name: demoAccount.label,
    };
  } else if (devBypass && !user) {
    profile = { id: "dev-user", role: "admin", display_name: "Dev Admin" };
  } else if (user) {
    const { data, error } = await supabase
      .from("users")
      .select("id, role, display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      logger.error("Profile fetch failed", error);
      return (
        <div className="flex h-screen items-center justify-center text-red-500">
          Failed to load admin profile. Please try again.
        </div>
      );
    }
    profile = data;
  }

  // Onboarding writes tenant config → admins only.
  if (!profile || profile.role !== "admin") {
    redirect("/login?redirect=/admin/cities");
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white lg:flex dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6 dark:border-zinc-800">
            <Building2 className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-semibold tracking-tight">
              Civic Admin
            </span>
          </div>
          <SidebarNav />
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {(profile.display_name?.charAt(0) ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {profile.display_name ?? "Admin"}
                </p>
                <p className="truncate text-xs text-zinc-500">admin</p>
              </div>
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="pt-safe flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <span className="font-semibold">Civic Admin</span>
            </div>
            <MobileNav />
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
