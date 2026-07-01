"use client";

import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { signOutDemo } from "@/app/login/actions";
import { SidebarNav, SidebarShell } from "@/components/dashboard/sidebar-shell";
import { teamIcon } from "@/components/teams/team-icon";
import { TEAMS, type TeamId } from "@/lib/teams";

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

  return (
    <SidebarShell
      context={
        <span
          className="inline-flex w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
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
      }
      footer={
        <div className="flex flex-col gap-2">
          {accountLabel ? (
            <p
              className="truncate px-0.5 text-[12px] text-faint"
              title={accountLabel}
            >
              {accountLabel}
            </p>
          ) : null}
          <form action={signOutDemo}>
            <button
              type="submit"
              aria-label={
                accountLabel ? `Sign out (${accountLabel})` : "Sign out"
              }
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-hairline bg-overlay px-2.5 text-[13px] font-medium text-subtle outline-none transition-colors hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
            >
              <LogOut
                className="h-3.5 w-3.5 shrink-0"
                strokeWidth={2}
                aria-hidden="true"
              />
              Sign out
            </button>
          </form>
        </div>
      }
    >
      <SidebarNav heading="Team views" items={items} />
    </SidebarShell>
  );
}
