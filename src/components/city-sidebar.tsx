"use client";

import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  FileText,
  Map as MapIcon,
  Table,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { CitySwitcher } from "@/components/city/city-switcher";
import {
  SidebarNav,
  SidebarShell,
  SidebarWhenCollapsed,
  SidebarWhenExpanded,
} from "@/components/dashboard/sidebar-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewSwitch } from "@/components/view-switch";
import { TEAM_LIST } from "@/lib/teams";

interface CitySidebarProps {
  slug: string;
  cityName?: string | null;
  cityState?: string | null;
  /** Server-computed staff status (or demo city), hides Grid for non-staff so
   *  the rail never links to a page that just bounces them to /login. */
  isStaff: boolean;
  /** Server-computed VIDEO_PIPELINE flag. The rail never links to a route
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
            {/* User|City segment + theme toggle, one row. */}
            <div className="flex h-8 w-full items-center gap-2 [&>div:first-child]:h-8 [&>div:first-child]:min-w-0 [&>div:first-child]:flex-1 [&_a]:h-full [&_a]:flex-1">
              <ViewSwitch citySlug={slug} />
              <ThemeToggle className="h-8 w-8 shrink-0" />
            </div>
          </SidebarWhenExpanded>
          <SidebarWhenCollapsed>
            <ThemeToggle className="h-9 w-full" />
          </SidebarWhenCollapsed>
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
