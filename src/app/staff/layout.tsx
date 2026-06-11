import { createServerClient } from "@/lib/db/client";
import { getAuthUser } from "@/lib/db/ssr-client";
import { redirect } from "next/navigation";
import { LogOut, Shield } from "lucide-react";
import { SidebarNav, MobileNav } from "@/components/staff/sidebar-nav";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  // Bypass only when BOTH flags are set — never in prod even if someone sets DEV_AUTH_BYPASS
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_BYPASS === "1";

  if (!user && !devBypass) redirect("/login");

  // Use service-role client to read users table (RLS may block anon key)
  const supabase = createServerClient();

  let profile;

  if (devBypass && !user) {
    profile = {
      id: "dev-user",
      role: "admin",
      display_name: "Dev Admin",
      email: "dev@local",
    };
  } else if (user) {
    const { data, error } = await supabase
      .from("users")
      .select("id, role, display_name, email")
      .eq("id", user.id)
      .single();
    if (error) {
      console.error("[staff/layout] profile fetch failed:", error.message);
      return (
        <div className="flex h-screen items-center justify-center text-red-500">
          Failed to load staff profile. Please try again.
        </div>
      );
    }
    profile = data;
  }

  if (
    !profile ||
    !["staff_dispatcher", "staff_supervisor", "admin"].includes(profile.role)
  ) {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6 dark:border-zinc-800">
          <Shield className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-semibold tracking-tight">
            Civic Staff
          </span>
        </div>

        {/* Nav */}
        <SidebarNav />

        {/* User info */}
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {(profile.display_name?.charAt(0) ?? '?').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {profile.display_name}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {profile.role.replace("_", " ")}
              </p>
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

      {/* Mobile header */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="pt-safe flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 lg:hidden">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-semibold">Civic Staff</span>
          </div>
          <MobileNav />
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
