"use client";

import {
  Bell,
  Camera,
  FileText,
  HeartPulse,
  Map as MapIcon,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarNav,
  SidebarShell,
  SidebarWhenCollapsed,
  SidebarWhenExpanded,
} from "@/components/dashboard/sidebar-shell";
import { EnvSwitch } from "@/components/env-switch";
import { PageGuideButton } from "@/components/page-guide/page-guide";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewSwitch } from "@/components/view-switch";

/** Solid accent CTA — the one affordance the city rail has no equivalent for. */
const REPORT_BUTTON_BASE = [
  "inline-flex items-center justify-center rounded-[var(--radius-md)]",
  "bg-[var(--color-primary)] text-[13px] font-medium text-[var(--accent-contrast)]",
  "transition-colors duration-150 outline-none",
  "hover:bg-[var(--color-primary-hover)]",
  "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

/** Desktop (md+) enterprise left rail for the resident surfaces — the same
 *  SidebarShell/SidebarNav primitives the city dashboard rail composes, so the
 *  two surfaces share one implementation rather than two lookalikes. Mobile is
 *  untouched: BottomTabBar plus the floating view/theme controls still own it. */
export function UserSidebar({ citySlug }: { citySlug?: string }) {
  const pathname = usePathname() ?? "";

  // Active predicates mirror BottomTabBar's TABS exactly so the two navs never
  // disagree — including the bare /user index (which redirects) lighting up
  // My Reports rather than nothing.
  const viewItems = [
    {
      label: "My Reports",
      href: "/user/my-reports",
      icon: FileText,
      active: pathname === "/user" || pathname.startsWith("/user/my-reports"),
    },
    {
      label: "Map",
      href: "/user/map",
      icon: MapIcon,
      active: pathname.startsWith("/user/map"),
    },
    {
      label: "Trending",
      href: "/user/trending",
      icon: TrendingUp,
      active: pathname.startsWith("/user/trending"),
    },
    {
      label: "Pulse",
      href: "/user/pulse",
      icon: HeartPulse,
      active: pathname.startsWith("/user/pulse"),
    },
    {
      label: "Updates",
      href: "/user/updates",
      icon: Bell,
      active: pathname.startsWith("/user/updates"),
    },
  ];

  return (
    <SidebarShell
      footer={
        <>
          <SidebarWhenExpanded>
            {/* Demo ⇄ Testing deployment switch — renders null unless a
                counterpart URL is configured, so this row usually collapses
                to nothing. It lived in UserNav; without it here the switch
                would be lost with the header. */}
            <EnvSwitch />
            {/* User|City segment + theme toggle — one row, as in CitySidebar. */}
            {/* Two rows, for the same reason as CitySidebar: ViewSwitch is
                shrink-0, so it plus two icon controls overflow the rail. */}
            <div className="mt-2 flex w-full flex-col gap-1.5">
              <div className="flex h-8 w-full items-center [&>div:first-child]:h-8 [&>div:first-child]:w-full [&>div:first-child]:min-w-0 [&_a]:h-full [&_a]:flex-1">
                <ViewSwitch citySlug={citySlug} />
              </div>
              <div className="flex h-8 w-full items-center gap-1.5">
                <PageGuideButton className="h-8 flex-1" />
                <ThemeToggle className="h-8 flex-1" />
              </div>
            </div>
          </SidebarWhenExpanded>
          <SidebarWhenCollapsed>
            {/* The icon rail has no width to share — the segment drops, the
                guide and toggle stack full-width. */}
            <div className="flex flex-col gap-1.5">
              <PageGuideButton className="h-9 w-full" />
              <ThemeToggle className="h-9 w-full" />
            </div>
          </SidebarWhenCollapsed>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <SidebarWhenExpanded>
          <Link
            href="/report"
            title="Report an issue"
            className={`${REPORT_BUTTON_BASE} h-9 w-full gap-2 px-3`}
          >
            <Camera
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
            Report an issue
          </Link>
        </SidebarWhenExpanded>
        <SidebarWhenCollapsed>
          <Link
            href="/report"
            aria-label="Report an issue"
            title="Report an issue"
            className={`${REPORT_BUTTON_BASE} h-9 w-full`}
          >
            <Camera
              className="h-4 w-4 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
          </Link>
        </SidebarWhenCollapsed>
        <SidebarNav heading="My city" items={viewItems} />
      </div>
    </SidebarShell>
  );
}
