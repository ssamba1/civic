"use client";

import {
  ArrowLeft,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Table,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutDemo } from "@/app/login/actions";
import {
  SidebarNav,
  SidebarShell,
  SidebarWhenCollapsed,
  SidebarWhenExpanded,
} from "@/components/dashboard/sidebar-shell";
import { teamIcon } from "@/components/teams/team-icon";
import { TEAMS, type TeamId } from "@/lib/teams";

interface TeamSidebarProps {
  team: TeamId;
  city: string;
  /** Active demo persona label (from the session cookie), or null if none. */
  accountLabel: string | null;
  /** Server-computed staff status (or demo city) — gates the Grid tab, which is
   *  staff-gated server-side, so the rail never links to a page that bounces to
   *  /login. Mirrors CitySidebar. */
  isStaff: boolean;
}

/** Desktop (md+) enterprise left rail for team views. Mobile keeps the fixed
 *  two-row TeamHeader. */
export function TeamSidebar({
  team,
  city,
  accountLabel,
  isStaff,
}: TeamSidebarProps) {
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
    // Team-scoped work-order grid — same spreadsheet as the city Grid, filtered
    // to this team's issues. Staff-gated server-side, so hide it for non-staff
    // (matching CitySidebar) rather than link to a page that bounces to /login.
    ...(isStaff
      ? [
          {
            label: "Grid",
            href: `${base}/grid`,
            icon: Table,
            active: pathname === `${base}/grid`,
          },
        ]
      : []),
    {
      label: "Analytics",
      href: `${base}/analytics`,
      icon: BarChart3,
      active: pathname === `${base}/analytics`,
    },
  ];

  // "Return to admin" — leaves this team workspace for the all-teams (admin)
  // city view. Sits above the team nav as the single, explicit way back; sibling
  // teams are reached from there, keeping this rail simple.
  const returnToAdminBtn = (compact: boolean) => (
    <Link
      href={`/city/${city}`}
      aria-label="Return to admin"
      title="Return to admin"
      className={[
        compact
          ? "inline-flex h-9 w-full items-center justify-center rounded-lg"
          : "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-2.5",
        "border border-hairline-strong bg-overlay text-[13px] font-medium text-foreground",
        "outline-none transition-colors hover:bg-overlay-strong",
        "focus-visible:ring-2 focus-visible:ring-accent/60",
      ].join(" ")}
    >
      <ArrowLeft
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      {!compact && "Return to admin"}
    </Link>
  );

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
            className="h-4 w-4 shrink-0"
            style={{ color: meta.color }}
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
        <SidebarWhenExpanded>{returnToAdminBtn(false)}</SidebarWhenExpanded>
        <SidebarWhenCollapsed>{returnToAdminBtn(true)}</SidebarWhenCollapsed>
        <SidebarNav heading="Team views" items={items} />
      </div>
    </SidebarShell>
  );
}
