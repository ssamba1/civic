"use client";

import {
  BarChart3,
  Clapperboard,
  FileText,
  Map as MapIcon,
  Table,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSlidingPill } from "@/lib/hooks/use-sliding-pill";

interface CityNavProps {
  slug: string;
  /**
   * Mobile layout slot, only used by CityHeader's mobile two-row structure.
   *   "tabs"    → full-width 4-up segmented control (bottom row)
   *   "actions" → Report + My View action buttons (top row, right side)
   *   undefined → full desktop inline row (md+ single-row)
   */
  mobileSlot?: "tabs" | "actions";
  /** Server-computed staff status (or demo city), hides Grid for non-staff so
   *  the nav never links to a page that just bounces them to /login. */
  isStaff: boolean;
  /** Server-computed VIDEO_PIPELINE flag. The tab never links to a route that
   *  404s when the pipeline ships dark. */
  videoEnabled?: boolean;
}

export function CityNav({
  slug,
  mobileSlot,
  isStaff,
  videoEnabled = false,
}: CityNavProps) {
  const pathname = usePathname();

  const items = [
    {
      label: "Teams",
      href: `/city/${slug}`,
      icon: UsersRound,
      active: pathname === `/city/${slug}`,
    },
    // {
    //   label: "Browse",
    //   href: `/city/${slug}/browse`,
    //   icon: ThumbsUp,
    //   active: pathname === `/city/${slug}/browse`,
    // },
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
        ]
      : []),
    {
      label: "Analytics",
      href: `/city/${slug}/analytics`,
      icon: BarChart3,
      active: pathname === `/city/${slug}/analytics`,
    },
  ];

  // Sliding-pill hook must run unconditionally (rules of hooks), compute it
  // before the mobile-slot early returns. Mobile branches don't use it.
  const activeHref = items.find((i) => i.active)?.href;
  const { trackRef, pill } = useSlidingPill(activeHref);

  // ── Mobile slot: full-width 4-up segmented tabs ────────────────────────
  if (mobileSlot === "tabs") {
    // Equal-width (flex-1) tabs → a sliding pill can translate by index×100% of
    // one tab's width. --tab-count keeps the math correct if items change.
    const activeIndex = Math.max(
      0,
      items.findIndex((i) => i.active),
    );
    return (
      <nav
        className="relative flex items-center rounded-[10px] border border-hairline bg-overlay p-0.5 w-full"
        aria-label="City views"
        style={
          {
            "--tab-count": items.length,
            "--tab-index": activeIndex,
          } as React.CSSProperties
        }
      >
        {/* Sliding active pill. Sits behind the tabs, translates to active index.
            p-0.5 (2px) inset on each side, so the track is the nav inner box. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 bottom-0.5 z-0 rounded-[8px] bg-overlay-strong shadow-[inset_0_0_0_1px_var(--hairline)] transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{
            width: "calc((100% - 0.25rem) / var(--tab-count))",
            transform: "translateX(calc(var(--tab-index) * 100%))",
          }}
        />
        {items.map(({ label, href, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              // flex-1 makes all 4 tabs equal width; min-h-11 = 44px touch target
              "group relative z-10 flex flex-1 flex-col items-center justify-center gap-1 min-h-11 rounded-[8px] px-1 py-2",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
              active ? "text-foreground" : "text-subtle hover:text-foreground",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-4 w-4 shrink-0 transition-colors duration-150",
                active
                  ? "text-foreground"
                  : "text-faint group-hover:text-subtle",
              ].join(" ")}
              strokeWidth={2}
              aria-hidden="true"
            />
            {/* Labels always visible on mobile tabs */}
            <span className="text-[11px] font-medium leading-none">
              {label}
            </span>
          </Link>
        ))}
      </nav>
    );
  }

  // ── Mobile slot: action buttons only (theme toggle) ───────────────────
  if (mobileSlot === "actions") {
    return (
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    );
  }

  // ── Desktop inline row (md+ default, no mobileSlot) ───────────────────
  return (
    <nav
      className="flex min-w-0 shrink items-center gap-2"
      aria-label="City views"
    >
      {/* Light ⇄ dark theme toggle */}
      <ThemeToggle />

      {/* Segmented control track */}
      <div
        ref={trackRef}
        className="relative flex min-w-0 items-center gap-0.5 rounded-[10px] border border-hairline bg-overlay p-0.5"
      >
        {/* Sliding active pill, measured to the active tab, eases between them. */}
        <span
          aria-hidden="true"
          className="pill-slide pointer-events-none absolute top-0.5 bottom-0.5 left-0 z-0 rounded-md bg-overlay-strong shadow-[inset_0_0_0_1px_var(--hairline)]"
          style={{
            width: pill.width,
            transform: `translateX(${pill.left}px)`,
            opacity: pill.ready ? 1 : 0,
          }}
        />
        {items.map(({ label, href, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            data-pill-active={active || undefined}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            className={[
              "group relative z-10 inline-flex h-7 items-center gap-1.5 rounded-md px-2 sm:px-2.5 text-[13px] font-medium",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
              active
                ? "text-foreground"
                : "text-subtle hover:bg-overlay hover:text-foreground",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
                active
                  ? "text-foreground"
                  : "text-faint group-hover:text-subtle",
              ].join(" ")}
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
