"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, BarChart3, Camera } from "lucide-react";

interface CityNavProps {
  slug: string;
}

export function CityNav({ slug }: CityNavProps) {
  const pathname = usePathname();

  const items = [
    {
      label: "Dashboard",
      href: `/city/${slug}`,
      icon: LayoutDashboard,
      active: pathname === `/city/${slug}`,
    },
    {
      label: "Map",
      href: `/city/${slug}/map`,
      icon: Map,
      active: pathname === `/city/${slug}/map`,
    },
    {
      label: "Analytics",
      href: `/city/${slug}/analytics`,
      icon: BarChart3,
      active: pathname === `/city/${slug}/analytics`,
    },
  ];

  return (
    <nav className="flex min-w-0 shrink items-center gap-2" aria-label="City views">
      {/* Segmented control track */}
      <div className="flex min-w-0 items-center gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5">
        {items.map(({ label, href, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            className={[
              "group relative inline-flex h-7 items-center gap-1.5 rounded-md px-2 sm:px-2.5 text-[13px] font-medium",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
              active
                ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
                active ? "text-[#0a84ff]" : "text-zinc-500 group-hover:text-zinc-300",
              ].join(" ")}
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </div>

      <Link
        href="/report"
        aria-label="Report"
        title="Report"
        className={[
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#0a84ff] px-2.5 sm:px-3 text-[13px] font-medium text-white",
          "transition-colors duration-150 outline-none",
          "hover:bg-[#0070e0]",
          "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        ].join(" ")}
      >
        <Camera className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline">Report</span>
      </Link>
    </nav>
  );
}
