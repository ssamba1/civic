"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutDemo } from "@/app/login/actions";
import { teamIcon } from "@/components/teams/team-icon";
import { TeamNav } from "@/components/teams/team-nav";
import { TEAMS, type TeamId } from "@/lib/teams";
import { cn } from "@/lib/utils/cn";

interface TeamHeaderProps {
  team: TeamId;
  city: string;
  /** Active demo persona label (from the session cookie), or null if none. */
  accountLabel: string | null;
}

export function TeamHeader({ team, city, accountLabel }: TeamHeaderProps) {
  const pathname = usePathname();
  // On the fullscreen map, drop the black casing so the map reads edge-to-edge.
  const transparent = pathname?.endsWith("/map") ?? false;
  const meta = TEAMS[team];
  const Icon = teamIcon(meta.icon);

  const badge = (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
      style={{
        color: meta.color,
        borderColor: `${meta.color}55`,
        backgroundColor: `${meta.color}1a`,
      }}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="truncate">{meta.shortLabel}</span>
    </span>
  );

  const logout = (
    <form action={signOutDemo}>
      <button
        type="submit"
        aria-label={accountLabel ? `Sign out (${accountLabel})` : "Sign out"}
        title={accountLabel ? `Sign out · ${accountLabel}` : "Sign out"}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-overlay px-2 sm:px-2.5 text-[13px] font-medium text-subtle outline-none transition-colors hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
      >
        <LogOut
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </form>
  );

  return (
    // Mobile-only since the desktop sidebar shell (TeamSidebar) took over md+.
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-40 pt-safe md:hidden",
        transparent
          ? "bg-transparent"
          : "border-b border-hairline bg-glass backdrop-blur-xl supports-[backdrop-filter]:bg-glass",
      )}
    >
      {/* ── Mobile: two rows (logo/identity row + segmented nav row) ── */}
      <div>
        <div className="flex h-14 w-full items-center justify-between gap-2 px-4">
          <Link
            href="/"
            className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
          >
            <span
              className="h-2 w-2 rounded-full bg-foreground"
              aria-hidden="true"
            />
            Civic
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {badge}
            {logout}
          </div>
        </div>
        <div className="px-2 pb-2">
          <TeamNav team={team} city={city} mobileSlot="tabs" />
        </div>
      </div>
    </header>
  );
}
