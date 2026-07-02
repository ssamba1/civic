"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CitySwitcher } from "@/components/city/city-switcher";
import { CityNav } from "@/components/city-nav";
import { ViewSwitch } from "@/components/view-switch";
import { cn } from "@/lib/utils/cn";

interface CityHeaderProps {
  slug: string;
  /** Real city identity (DB-resolved) so onboarded cities not in the hardcoded
   *  municipality list still render their own name in the switcher. */
  cityName?: string | null;
  cityState?: string | null;
  /** Server-computed staff status (or demo city) — controls whether CityNav
   *  shows the Grid tab, which is staff-gated server-side. */
  isStaff: boolean;
}

export function CityHeader({
  slug,
  cityName,
  cityState,
  isStaff,
}: CityHeaderProps) {
  const pathname = usePathname();
  // On the fullscreen map, drop the black casing so the map reads edge-to-edge.
  const transparent = pathname?.endsWith("/map") ?? false;

  return (
    // Mobile-only since the desktop sidebar shell (CitySidebar) took over md+.
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-40 pt-safe md:hidden",
        transparent
          ? "bg-transparent"
          : "border-b border-hairline bg-glass backdrop-blur-xl supports-[backdrop-filter]:bg-glass",
      )}
    >
      {/* ── Mobile layout: two rows (logo row + segmented nav row) ── */}
      <div>
        {/* Row 1: Civic logo + city switcher (left), action buttons (right) */}
        <div className="flex h-14 w-full items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span
                className="h-2 w-2 rounded-full bg-accent"
                aria-hidden="true"
              />
              Civic
            </Link>
            <CitySwitcher
              currentSlug={slug}
              currentName={cityName}
              currentState={cityState}
              compact
              className="min-w-0"
            />
          </div>
          {/* Action buttons — mobile only slot */}
          <div className="flex shrink-0 items-center gap-2">
            <ViewSwitch citySlug={slug} />
            <CityNav slug={slug} mobileSlot="actions" isStaff={isStaff} />
          </div>
        </div>
        {/* Row 2: Full-width segmented nav */}
        <div className="px-2 pb-2">
          <CityNav slug={slug} mobileSlot="tabs" isStaff={isStaff} />
        </div>
      </div>
    </header>
  );
}
