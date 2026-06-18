import { AnonBootstrap } from "@/components/resident/anon-bootstrap";
import { UserNav } from "@/components/resident/user-nav";
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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <AnonBootstrap />
      <UserNav citySlug={citySlug} />

      {/* Mobile has no top header (BottomTabBar covers nav) — float the
          view switch top-right so User⇄City stays reachable on phones. */}
      <div
        className="md:hidden fixed right-3 top-0 z-50"
        style={{ marginTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <ViewSwitch citySlug={citySlug} />
      </div>

      {/*
       * pt-4:  on mobile the UserNav is hidden so we just need a small top
       *        breathing room.
       * md:pt-20: on md+ the fixed UserNav (h-14) is visible; restore the
       *           header offset.
       * pb-[calc(5.5rem+env(safe-area-inset-bottom))]: keep content clear of
       *   the BottomTabBar (~h-16) AND add the home-bar safe-area. Merged into
       *   one calc() so only a single padding-bottom declaration exists — using
       *   separate pb-[5.5rem] + pb-safe would let the cascade pick only one.
       * md:pb-0: no bottom bar on desktop.
       */}
      <main className="flex-1 flex flex-col pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pt-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
