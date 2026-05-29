"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UsersRound, ThumbsUp, Map, BarChart3, Camera, RefreshCw } from "lucide-react";
import { useDemoReports } from "@/lib/demo-reports";

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
      title={active ? "Remove the live report (demo)" : "Add a live report (demo)"}
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
        className={["h-3.5 w-3.5 shrink-0", spinning && "animate-spin"]
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
    {
      label: "Browse",
      href: `/city/${slug}/browse`,
      icon: ThumbsUp,
      active: pathname === `/city/${slug}/browse`,
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

  // ── Mobile slot: full-width 4-up segmented tabs ────────────────────────
  if (mobileSlot === "tabs") {
    return (
      <nav
        className="flex items-center gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5 w-full"
        aria-label="City views"
      >
        {items.map(({ label, href, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              // flex-1 makes all 4 tabs equal width; min-h-11 = 44px touch target
              "group relative flex flex-1 flex-col items-center justify-center gap-1 min-h-11 rounded-[8px] px-1 py-2",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
              active
                ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-4 w-4 shrink-0 transition-colors duration-150",
                active ? "text-[#0a84ff]" : "text-zinc-500 group-hover:text-zinc-300",
              ].join(" ")}
              strokeWidth={2}
              aria-hidden="true"
            />
            {/* Labels always visible on mobile tabs */}
            <span className="text-[11px] font-medium leading-none">{label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  // ── Mobile slot: action buttons only (Report + My View) ───────────────
  if (mobileSlot === "actions") {
    return (
      <div className="flex items-center gap-2">
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
          <Camera className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Report</span>
        </Link>
      </div>
    );
  }

  // ── Desktop inline row (md+ default, no mobileSlot) ───────────────────
  return (
    <nav className="flex min-w-0 shrink items-center gap-2" aria-label="City views">
      {/* Demo Refresh — left of the Teams tab */}
      <NavRefreshButton />

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
