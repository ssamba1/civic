"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface CityNavProps {
  slug: string;
}

export function CityNav({ slug }: CityNavProps) {
  const pathname = usePathname();

  const isDashboardActive = pathname === `/city/${slug}`;
  const isMapActive = pathname === `/city/${slug}/map`;
  const isAnalyticsActive = pathname === `/city/${slug}/analytics`;

  const linkBase =
    "px-3 py-1.5 text-[13px] rounded-md transition-colors";
  const linkActive = "text-white bg-white/[0.08]";
  const linkInactive = "text-zinc-400 hover:text-white hover:bg-white/[0.04]";

  return (
    <nav className="flex items-center gap-1">
      <Link
        href={`/city/${slug}`}
        className={`${linkBase} ${isDashboardActive ? linkActive : linkInactive}`}
      >
        Dashboard
      </Link>
      <Link
        href={`/city/${slug}/map`}
        className={`${linkBase} ${isMapActive ? linkActive : linkInactive}`}
      >
        Map
      </Link>
      <Link
        href={`/city/${slug}/analytics`}
        className={`${linkBase} ${isAnalyticsActive ? linkActive : linkInactive}`}
      >
        Analytics
      </Link>
      <Link
        href="/report"
        className="ml-2 inline-flex h-8 items-center rounded-md bg-[#0a84ff] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0070e0]"
      >
        Report
      </Link>
    </nav>
  );
}
