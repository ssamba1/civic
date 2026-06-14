"use client";

import {
  BarChart3,
  Camera,
  Map as MapIcon,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { EnvSwitch } from "@/components/env-switch";
import { DEMO_MODE } from "@/lib/demo-mode";
import { useDemoReports } from "@/lib/demo-reports";
import { useSlidingPill } from "@/lib/hooks/use-sliding-pill";

/**
 * Demo Refresh — toggles the live fallen-tree report in the shared overlay
 * store (src/lib/demo-reports.ts). First click injects the data point (lighting
 * up every city surface: teams, map, analytics, browse) and the button goes
 * solid; a second click removes it. Sits left of the segmented nav track. No
 * separate reset control — the same button is the on/off switch.
 */
function NavRefreshButton() {
  const { demoReports, add, reset } = useDemoReports();
  const active = demoReports.length > 0;
  const [spinning, setSpinning] = useState(false);

  const onClick = useCallback(() => {
    if (active) reset();
    else add();
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 600);
  }, [active, add, reset]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? "Remove live demo report" : "Add live demo report"}
      title={
        active ? "Remove the live report (demo)" : "Add a live report (demo)"
      }
      className={[
        "group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 sm:px-2.5 text-[13px] font-medium",
        "transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
        active
          ? "border-[#0a84ff] bg-[#0a84ff] text-white hover:bg-[#0070e0]"
          : "border-[#0a84ff]/40 bg-[#0a84ff]/10 text-[#5ac8fa] hover:bg-[#0a84ff]/20 hover:text-white",
      ].join(" ")}
    >
      <RefreshCw
        className={[
          "h-3.5 w-3.5 shrink-0",
          spinning && "motion-safe:animate-spin",
        ]
          .filter(Boolean)
          .join(" ")}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="hidden md:inline">Refresh</span>
    </button>
  );
}

interface CityNavProps {
  slug: string;
  /**
   * Mobile layout slot — only used by CityHeader's mobile two-row structure.
   *   "tabs"    → full-width 4-up segmented control (bottom row)
   *   "actions" → Report + My View action buttons (top row, right side)
   *   undefined → full desktop inline row (md+ single-row)
   */
  mobileSlot?: "tabs" | "actions";
}

export function CityNav({ slug, mobileSlot }: CityNavProps) {
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
    {
      label: "Analytics",
      href: `/city/${slug}/analytics`,
      icon: BarChart3,
      active: pathname === `/city/${slug}/analytics`,
    },
  ];

  // Sliding-pill hook must run unconditionally (rules of hooks) — compute it
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
        className="relative flex items-center rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5 w-full"
        aria-label="City views"
        style={
          {
            "--tab-count": items.length,
            "--tab-index": activeIndex,
          } as React.CSSProperties
        }
      >
        {/* Sliding active pill — sits behind the tabs, translates to active index.
            p-0.5 (2px) inset on each side, so the track is the nav inner box. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 bottom-0.5 z-0 rounded-[8px] bg-white/[0.09] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
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
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
              active ? "text-white" : "text-zinc-400 hover:text-zinc-100",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-4 w-4 shrink-0 transition-colors duration-150",
                active
                  ? "text-[#0a84ff]"
                  : "text-zinc-500 group-hover:text-zinc-300",
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

  // ── Mobile slot: action buttons only (Report + My View) ───────────────
  if (mobileSlot === "actions") {
    return (
      <div className="flex items-center gap-2">
        <EnvSwitch />
        <Link
          href="/report"
          aria-label="Report"
          title="Report"
          className={[
            // min-h-11 / min-w-11 = 44px touch target
            "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-[#0a84ff] px-3 text-[13px] font-medium text-white",
            "transition-colors duration-150 outline-none",
            "hover:bg-[#0070e0]",
            "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          ].join(" ")}
        >
          <Camera
            className="h-4 w-4 shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="sr-only">Report</span>
        </Link>
      </div>
    );
  }

  // ── Desktop inline row (md+ default, no mobileSlot) ───────────────────
  return (
    <nav
      className="flex min-w-0 shrink items-center gap-2"
      aria-label="City views"
    >
      {/* Demo ⇄ Testing deployment switch — leftmost action */}
      <EnvSwitch />
      {/* Demo Refresh — left of the Teams tab. Demo deployments only: the
          injected tree report is sample data, not for the live site. */}
      {DEMO_MODE && <NavRefreshButton />}

      {/* Segmented control track */}
      <div
        ref={trackRef}
        className="relative flex min-w-0 items-center gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5"
      >
        {/* Sliding active pill — measured to the active tab, eases between them. */}
        <span
          aria-hidden="true"
          className="pill-slide pointer-events-none absolute top-0.5 bottom-0.5 left-0 z-0 rounded-md bg-white/[0.09] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
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
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
              active
                ? "text-white"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
                active
                  ? "text-[#0a84ff]"
                  : "text-zinc-500 group-hover:text-zinc-300",
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
        <Camera
          className="h-3.5 w-3.5 shrink-0"
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">Report</span>
      </Link>
    </nav>
  );
}
