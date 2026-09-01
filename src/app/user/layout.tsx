import { AnonBootstrap } from "@/components/resident/anon-bootstrap";
import { UserSidebar } from "@/components/resident/user-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewSwitch } from "@/components/view-switch";
import { getCurrentResident } from "@/lib/resident-data";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Anon-first (PLAN.md §7): no login wall. Pages render with the resident's
  // session data when present and a demo fallback otherwise; AnonBootstrap
  // silently establishes a guest session for reports/upvotes/my-reports.
  //
  // Resolve the resident's city once here so the User⇄City switch links to
  // THEIR city, not a hardcoded default — the whole header is city-correct from
  // a single source.
  const { citySlug } = await getCurrentResident();

  return (
    // Column on mobile (BottomTabBar + floating controls); row on md+ where the
    // sticky UserSidebar owns the left rail and flexbox owns content width —
    // the same shape the city dashboard layout uses.
    // dvh is resolved before the html zoom (globals.css --app-zoom) scales it —
    // divide back out so full-viewport routes (map) reach the bottom instead of
    // stopping 10% short.
    <div className="flex min-h-[calc(100dvh/var(--app-zoom,1))] flex-col bg-background text-foreground md:flex-row">
      <AnonBootstrap />
      <UserSidebar citySlug={citySlug} />

      {/* Mobile has no top header (BottomTabBar covers nav) — float the
          view switch top-right so User⇄City stays reachable on phones. */}
      <div
        className="md:hidden fixed right-3 top-0 z-50 flex items-center gap-2"
        style={{ marginTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <ThemeToggle />
        <ViewSwitch citySlug={citySlug} />
      </div>

      {/*
       * pt-4:  on mobile there is no top header, so we just need a small top
       *        breathing room.
       * md:pt-6: on md+ the sidebar rail replaces the old fixed header, so the
       *          former pt-20 header offset collapses to the 24px of breathing
       *          room that offset actually contributed (80px pad − h-14 bar).
       * pb-[calc(5.5rem+env(safe-area-inset-bottom))]: keep content clear of
       *   the BottomTabBar (~h-16) AND add the home-bar safe-area. Merged into
       *   one calc() so only a single padding-bottom declaration exists — using
       *   separate pb-[5.5rem] + pb-safe would let the cascade pick only one.
       * md:pb-0: no bottom bar on desktop.
       */}
      <main className="flex-1 flex flex-col min-w-0 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pt-6 md:pb-0">
        {children}
      </main>
    </div>
  );
}
