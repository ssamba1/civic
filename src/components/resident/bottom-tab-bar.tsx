"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, Camera, HeartPulse, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const ACCENT = "#0a84ff";

interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Returns true when the current pathname should mark this tab active. */
  isActive: (pathname: string) => boolean;
}

const TABS: TabItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Home,
    // Exact match — every path starts with "/", so a prefix test would
    // light Home up on every screen.
    isActive: (p) => p === "/",
  },
  {
    label: "Map",
    href: "/city/cumming/map",
    icon: Map,
    isActive: (p) => /^\/city\/[^/]+\/map$/.test(p),
  },
  {
    label: "Pulse",
    href: "/user/pulse",
    icon: HeartPulse,
    isActive: (p) => p.startsWith("/user/pulse"),
  },
  {
    label: "Updates",
    href: "/user/updates",
    icon: Bell,
    isActive: (p) => p.startsWith("/user/updates"),
  },
];

export function BottomTabBar() {
  const pathname = usePathname();

  // Self-gate: resident surfaces only. Renders on the landing page ("/"),
  // anything under "/user", and the city map (the Map tab target). Returns null
  // on /report, other /city pages, /staff, /login.
  const onCityMap = /^\/city\/[^/]+\/map$/.test(pathname ?? "");
  if (
    pathname == null ||
    !(pathname === "/" || pathname.startsWith("/user") || onCityMap)
  ) {
    return null;
  }

  // Split tabs around the center FAB: Home + Map | [Report] | Pulse + Updates.
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  const fabActive = pathname.startsWith("/report"); // bar never renders on /report, kept defensive.

  return (
    <nav
      aria-label="Resident navigation"
      // .pb-safe is the shared contract (added to globals.css by the layout owner).
      // The inline env() fallback wins on specificity so it works even before
      // that class lands, and does not double up once it does.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className={cn(
        "md:hidden", // mobile-only; desktop keeps the existing header nav
        "fixed inset-x-0 bottom-0 z-40 pb-safe",
        "border-t border-white/[0.08]",
        "bg-black/70 backdrop-blur-xl supports-[backdrop-filter]:bg-black/55",
      )}
    >
      <ul className="flex h-16 items-stretch justify-around px-1">
        {left.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.isActive(pathname)} />
        ))}

        {/* Center elevated Report FAB */}
        <li className="flex flex-1 items-center justify-center">
          <Link
            href="/report"
            aria-label="Report an issue"
            aria-current={fabActive ? "page" : undefined}
            className={cn(
              "group relative -mt-5 inline-flex h-14 w-14 items-center justify-center rounded-full",
              "bg-[#0a84ff] text-white",
              "shadow-[0_6px_16px_rgba(10,132,255,0.45)] ring-1 ring-white/15",
              "outline-none transition-[transform,background-color] duration-150 ease-out",
              "hover:bg-[#0070e0] active:scale-95",
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
              "motion-reduce:transition-none motion-reduce:active:scale-100",
            )}
          >
            <Camera className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">Report</span>
          </Link>
        </li>

        {right.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.isActive(pathname)} />
        ))}
      </ul>
    </nav>
  );
}

function TabLink({ tab, active }: { tab: TabItem; active: boolean }) {
  const { label, href, icon: Icon } = tab;

  return (
    <li className="flex flex-1">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          // >=44px hit area on both axes via min-h-11 + full-width flex cell.
          "group flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-1.5",
          "text-[11px] font-medium leading-none",
          "outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
          "motion-reduce:transition-none",
          active ? "text-[#0a84ff]" : "text-zinc-400 hover:text-zinc-200",
        )}
      >
        <Icon
          className="h-5 w-5 shrink-0"
          strokeWidth={active ? 2.25 : 2}
          color={active ? ACCENT : undefined}
          aria-hidden="true"
        />
        <span className="max-w-full truncate">{label}</span>
      </Link>
    </li>
  );
}
