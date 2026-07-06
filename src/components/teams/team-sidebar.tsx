"use client";

import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  UsersRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { signOutDemo } from "@/app/login/actions";
import {
  SidebarNav,
  SidebarShell,
  SidebarWhenCollapsed,
  SidebarWhenExpanded,
} from "@/components/dashboard/sidebar-shell";
import { teamIcon } from "@/components/teams/team-icon";
import { TEAM_LIST, TEAMS, type TeamId } from "@/lib/teams";

interface TeamSidebarProps {
  team: TeamId;
  city: string;
  /** Active demo persona label (from the session cookie), or null if none. */
  accountLabel: string | null;
}

/** Desktop (md+) enterprise left rail for team views. Mobile keeps the fixed
 *  two-row TeamHeader. */
export function TeamSidebar({ team, city, accountLabel }: TeamSidebarProps) {
  const pathname = usePathname();
  const meta = TEAMS[team];
  const Icon = teamIcon(meta.icon);
  const base = `/${team}/${city}`;

  const items = [
    {
      label: "Overview",
      href: base,
      icon: LayoutDashboard,
      active: pathname === base,
    },
    {
      label: "Map",
      href: `${base}/map`,
      icon: MapIcon,
      active: pathname === `${base}/map`,
    },
    {
      label: "Analytics",
      href: `${base}/analytics`,
      icon: BarChart3,
      active: pathname === `${base}/analytics`,
    },
  ];

  // Back to the all-teams city view, with sibling teams as sub-tabs so
  // switching workspaces never requires the city page round-trip.
  const cityItems = [
    {
      label: "All teams",
      href: `/city/${city}`,
      icon: UsersRound,
      active: false,
      sub: TEAM_LIST.filter((t) => t.id !== "all").map((t) => ({
        label: t.shortLabel,
        href: `/${t.id}/${city}`,
        active: t.id === team,
        // Grayscale by design — department identity is chrome, not state or
        // map/chart category encoding, so the dot stays neutral everywhere.
        dotColor: "var(--faint)",
      })),
    },
  ];

  const signOutBtn = (compact: boolean) => (
    <form action={signOutDemo}>
      <button
        type="submit"
        aria-label={accountLabel ? `Sign out (${accountLabel})` : "Sign out"}
        title={accountLabel ? `Sign out · ${accountLabel}` : "Sign out"}
        className={[
          compact
            ? "inline-flex h-9 w-full items-center justify-center rounded-lg"
            : "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg px-2.5",
          "border border-hairline bg-overlay text-[13px] font-medium text-subtle",
          "outline-none transition-colors hover:bg-overlay-strong hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-accent/60",
        ].join(" ")}
      >
        <LogOut
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
        {!compact && "Sign out"}
      </button>
    </form>
  );

  return (
    <SidebarShell
      context={
        <span className="inline-flex w-full min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
          <Icon
            className="h-4 w-4 shrink-0 text-subtle"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="truncate">{meta.shortLabel}</span>
        </span>
      }
      footer={
        <>
          <SidebarWhenExpanded>
            <div className="flex flex-col gap-2">
              {accountLabel ? (
                <p
                  className="truncate px-0.5 text-[12px] text-faint"
                  title={accountLabel}
                >
                  {accountLabel}
                </p>
              ) : null}
              {signOutBtn(false)}
            </div>
          </SidebarWhenExpanded>
          <SidebarWhenCollapsed>{signOutBtn(true)}</SidebarWhenCollapsed>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SidebarNav heading="Team views" items={items} />
        <SidebarNav heading="City" items={cityItems} />
      </div>
    </SidebarShell>
  );
}
