"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CityNav } from "@/components/city-nav";
import { ViewSwitch } from "@/components/view-switch";
import { CitySwitcher } from "@/components/city/city-switcher";
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
        "fixed top-0 inset-x-0 z-40 pt-safe",
        transparent
          ? "bg-transparent"
          : "border-b border-white/[0.06] bg-black/60 backdrop-blur-xl supports-[backdrop-filter]:bg-black/50",
      )}
    >
      {/* ── Mobile layout: two rows (logo row + segmented nav row) ── */}
      <div className="md:hidden">
        {/* Row 1: Civic logo + city switcher (left), action buttons (right) */}
        <div className="flex h-14 w-full items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-white outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
            >
              <span
                className="h-2 w-2 rounded-full bg-[#0a84ff] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
                aria-hidden="true"
              />
              Civic
            </Link>
            <CitySwitcher currentSlug={slug} compact className="min-w-0" />
          </div>
          {/* Action buttons — mobile only slot */}
          <div className="flex shrink-0 items-center gap-2">
            <ViewSwitch citySlug={slug} />
            <CityNav slug={slug} mobileSlot="actions" />
          </div>
        </div>
        {/* Row 2: Full-width segmented nav */}
        <div className="px-2 pb-2">
          <CityNav slug={slug} mobileSlot="tabs" />
        </div>
      </div>

      {/* ── Desktop layout (md+): single row, unchanged ── */}
      <div className="hidden md:flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="group inline-flex shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-white outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
          >
            <span
              className="h-2 w-2 rounded-full bg-[#0a84ff] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
              aria-hidden="true"
            />
            Civic
          </Link>
          <CitySwitcher currentSlug={slug} compact className="min-w-0" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <CityNav slug={slug} />
          <ViewSwitch citySlug={slug} />
        </div>
      </div>
    </header>
  );
}
