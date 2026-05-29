"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CityNav } from "@/components/city-nav";
import { cn } from "@/lib/utils/cn";

interface CityHeaderProps {
  slug: string;
}

export function CityHeader({ slug }: CityHeaderProps) {
  const pathname = usePathname();
  // On the fullscreen map, drop the black casing so the map reads edge-to-edge.
  const transparent = pathname?.endsWith("/map") ?? false;

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-40",
        transparent
          ? "bg-transparent"
          : "border-b border-white/[0.06] bg-black/60 backdrop-blur-xl supports-[backdrop-filter]:bg-black/50",
      )}
    >
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-white outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
        >
          <span
            className="h-2 w-2 rounded-full bg-[#0a84ff] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
            aria-hidden="true"
          />
          Civic
        </Link>
        <CityNav slug={slug} />
      </div>
    </header>
  );
}
