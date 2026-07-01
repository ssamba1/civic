"use client";

import {
  BarChart3,
  Camera,
  Map as MapIcon,
  Table,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CitySwitcher } from "@/components/city/city-switcher";
import { NavRefreshButton } from "@/components/city-nav";
import { SidebarNav, SidebarShell } from "@/components/dashboard/sidebar-shell";
import { EnvSwitch } from "@/components/env-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewSwitch } from "@/components/view-switch";
import { DEMO_MODE } from "@/lib/demo-mode";

interface CitySidebarProps {
  slug: string;
  cityName?: string | null;
  cityState?: string | null;
}

/** Desktop (md+) enterprise left rail for the city dashboard. Mobile keeps
 *  the fixed two-row CityHeader. */
export function CitySidebar({ slug, cityName, cityState }: CitySidebarProps) {
  const pathname = usePathname();

  const items = [
    {
      label: "Teams",
      href: `/city/${slug}`,
      icon: UsersRound,
      active: pathname === `/city/${slug}`,
    },
    {
      label: "Map",
      href: `/city/${slug}/map`,
      icon: MapIcon,
      active: pathname === `/city/${slug}/map`,
    },
    {
      label: "Grid",
      href: `/city/${slug}/grid`,
      icon: Table,
      active: pathname === `/city/${slug}/grid`,
    },
    {
      label: "Analytics",
      href: `/city/${slug}/analytics`,
      icon: BarChart3,
      active: pathname === `/city/${slug}/analytics`,
    },
  ];

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
        <div className="flex flex-col gap-2">
          <Link
            href="/report"
            className={[
              "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#0a84ff] px-3 text-[13px] font-medium text-white",
              "transition-colors duration-150 outline-none",
              "hover:bg-[#0070e0]",
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            ].join(" ")}
          >
            <Camera
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
            Report
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <ViewSwitch citySlug={slug} />
            <EnvSwitch />
            <ThemeToggle />
            {DEMO_MODE && <NavRefreshButton />}
          </div>
        </div>
      }
    >
      <SidebarNav heading="City views" items={items} />
    </SidebarShell>
  );
}
