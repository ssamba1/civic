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
  const isBrowseActive = pathname === `/city/${slug}/browse`;

  return (
    <nav className="flex items-center gap-2">
      <Link
        href={`/city/${slug}`}
        className={`px-3 py-1.5 text-xs font-semibold rounded-full tracking-wide transition-all duration-300 ${
          isDashboardActive
            ? "bg-blue-50 text-blue-600 border border-blue-200/50 shadow-sm"
            : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
        }`}
      >
        Dashboard
      </Link>
      <Link
        href={`/city/${slug}/browse`}
        className={`px-3 py-1.5 text-xs font-semibold rounded-full tracking-wide transition-all duration-300 ${
          isBrowseActive
            ? "bg-blue-50 text-blue-600 border border-blue-200/50 shadow-sm"
            : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
        }`}
      >
        Browse
      </Link>
      <Link
        href={`/city/${slug}/map`}
        className={`px-3 py-1.5 text-xs font-semibold rounded-full tracking-wide transition-all duration-300 ${
          isMapActive
            ? "bg-blue-50 text-blue-600 border border-blue-200/50 shadow-sm"
            : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
        }`}
      >
        Map View
      </Link>
      <Link
        href="/report"
        className="ml-2 inline-flex h-8 items-center rounded-full bg-zinc-900 px-4 text-xs font-bold text-white transition-all duration-300 hover:bg-zinc-800 shadow-md hover:shadow-lg"
      >
        Report Issue
      </Link>
    </nav>
  );
}
