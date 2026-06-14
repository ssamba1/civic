"use client";

import { BarChart3, ListChecks, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlidingPill } from "@/lib/hooks/use-sliding-pill";

interface TeamNavProps {
  team: string;
  city: string;
  /**
   * Mobile layout slot — mirrors CityNav's two-row structure.
   *   "tabs"    → full-width segmented control (bottom row)
   *   undefined → desktop inline row (md+ single-row)
   */
  mobileSlot?: "tabs";
}

export function TeamNav({ team, city, mobileSlot }: TeamNavProps) {
  const pathname = usePathname();
  const base = `/${team}/${city}`;

  const items = [
    { label: "Tasks", href: base, icon: ListChecks, active: pathname === base },
    {
      label: "Map",
      href: `${base}/map`,
      icon: MapIcon,
      active: pathname === `${base}/map`,
    },
    {
      label: "Analytics",
      href: `${base}/analytics`,
      icon: BarChart3,
      active: pathname === `${base}/analytics`,
    },
  ];

  // Sliding-pill hook must run unconditionally (rules of hooks) — compute it
  // before the mobile-slot early return. The mobile branch doesn't use it.
  const activeHref = items.find((i) => i.active)?.href;
  const { trackRef, pill } = useSlidingPill(activeHref);

  // ── Mobile slot: full-width segmented tabs ──────────────────────────────
  if (mobileSlot === "tabs") {
    return (
      <nav
        className="flex items-center gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5 w-full"
        aria-label="Team views"
      >
        {items.map(({ label, href, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
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
                active
                  ? "text-[#0a84ff]"
                  : "text-zinc-500 group-hover:text-zinc-300",
              ].join(" ")}
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="text-[11px] font-medium leading-none">
              {label}
            </span>
          </Link>
        ))}
      </nav>
    );
  }

  // ── Desktop inline row (md+) ────────────────────────────────────────────
  return (
    <nav
      className="flex min-w-0 shrink items-center gap-2"
      aria-label="Team views"
    >
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
    </nav>
  );
}
