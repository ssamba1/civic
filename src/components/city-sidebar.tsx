"use client";

import {
  BarChart3,
  CalendarDays,
  Camera,
  Clapperboard,
  FileText,
  Map as MapIcon,
  Table,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CitySwitcher } from "@/components/city/city-switcher";
import { NavRefreshButton } from "@/components/city-nav";
import {
  SidebarNav,
  SidebarShell,
  SidebarWhenCollapsed,
  SidebarWhenExpanded,
} from "@/components/dashboard/sidebar-shell";
import { EnvSwitch } from "@/components/env-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewSwitch } from "@/components/view-switch";
import { DEMO_MODE } from "@/lib/demo-mode";
import { TEAM_LIST } from "@/lib/teams";

interface CitySidebarProps {
  slug: string;
  cityName?: string | null;
  cityState?: string | null;
  /** Server-computed staff status (or demo city) — hides Grid for non-staff so
   *  the rail never links to a page that just bounces them to /login. */
  isStaff: boolean;
  /** Server-computed VIDEO_PIPELINE flag — the rail never links to a route
   *  that 404s when the pipeline ships dark. */
  videoEnabled?: boolean;
}

/** Desktop (md+) enterprise left rail for the city dashboard. Mobile keeps
 *  the fixed two-row CityHeader. */
export function CitySidebar({
  slug,
  cityName,
  cityState,
  isStaff,
  videoEnabled = false,
}: CitySidebarProps) {
  const pathname = usePathname();

  // Efferd-style grouped rail: city surfaces up top, staff workspace tools in
  // their own captioned section beneath.
  const viewItems = [
    {
      label: "Teams",
      href: `/city/${slug}`,
      icon: UsersRound,
      active: pathname === `/city/${slug}`,
      // Drill into a team's workspace directly from the rail.
      sub: TEAM_LIST.filter((t) => t.id !== "all").map((t) => ({
        label: t.shortLabel,
        href: `/city/${slug}/team/${t.id}`,
        active: pathname?.startsWith(`/city/${slug}/team/${t.id}`) ?? false,
        dotColor: t.color,
      })),
    },
    {
      label: "Map",
      href: `/city/${slug}/map`,
      icon: MapIcon,
      active: pathname === `/city/${slug}/map`,
    },
    ...(isStaff
      ? [
          {
            label: "Grid",
            href: `/city/${slug}/grid`,
            icon: Table,
            active: pathname === `/city/${slug}/grid`,
          },
          {
            label: "Calendar",
            href: `/city/${slug}/calendar`,
            icon: CalendarDays,
            active: pathname === `/city/${slug}/calendar`,
          },
        ]
      : []),
    {
      label: "Analytics",
      href: `/city/${slug}/analytics`,
      icon: BarChart3,
      active: pathname === `/city/${slug}/analytics`,
    },
  ];

  const workspaceItems = isStaff
    ? [
        ...(videoEnabled
          ? [
              {
                label: "Video",
                href: `/city/${slug}/video`,
                icon: Clapperboard,
                active: pathname === `/city/${slug}/video`,
              },
            ]
          : []),
        {
          label: "Documents",
          href: `/city/${slug}/documents`,
          icon: FileText,
          active: pathname === `/city/${slug}/documents`,
        },
        {
          label: "Members",
          href: `/city/${slug}/members`,
          icon: Users,
          active: pathname === `/city/${slug}/members`,
        },
        {
          label: "Routing",
          href: `/city/${slug}/routing`,
          icon: Workflow,
          active: pathname === `/city/${slug}/routing`,
        },
      ]
    : [];

  const reportBtn = (compact: boolean) => (
    <Link
      href="/report"
      aria-label="Report"
      title="Report"
      className={[
        compact
          ? "inline-flex h-9 w-full items-center justify-center rounded-lg"
          : "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg px-3",
        "bg-accent text-[13px] font-medium text-accent-contrast",
        "transition-opacity duration-150 outline-none hover:opacity-90",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      ].join(" ")}
    >
      <Camera
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      {!compact && "Report"}
    </Link>
  );

  return (
    <SidebarShell
      context={
        <CitySwitcher
          currentSlug={slug}
          currentName={cityName}
          currentState={cityState}
          compact
          className="min-w-0"
        />
      }
      footer={
        <>
          <SidebarWhenExpanded>
            <div className="flex flex-col gap-2">
              {reportBtn(false)}
              <div className="flex flex-col gap-2 pt-1">
                {/* User|City segment — full-width row, segments split evenly */}
                <div className="flex h-8 w-full items-center [&>div]:h-8 [&>div]:w-full [&_a]:h-full [&_a]:flex-1">
                  <ViewSwitch citySlug={slug} />
                </div>
                {/* Deployment switch + theme toggle — share one row */}
                <div className="flex h-8 w-full items-center gap-2 [&>a]:h-full [&>a]:flex-1 [&>a]:justify-center">
                  <EnvSwitch />
                  <ThemeToggle className="h-8 w-8 shrink-0" />
                </div>
                {DEMO_MODE && (
                  <div className="flex h-8 w-full items-center [&>button]:h-full [&>button]:w-full [&>button]:justify-center">
                    <NavRefreshButton />
                  </div>
                )}
              </div>
            </div>
          </SidebarWhenExpanded>
          <SidebarWhenCollapsed>{reportBtn(true)}</SidebarWhenCollapsed>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <SidebarNav heading="City views" items={viewItems} />
        {workspaceItems.length > 0 && (
          <SidebarNav heading="Workspace" items={workspaceItems} />
        )}
      </div>
    </SidebarShell>
  );
}
