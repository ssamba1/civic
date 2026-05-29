"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, HeartPulse, Camera } from "lucide-react";

import { UpdatesPopover } from "@/components/resident/updates-popover";

export function UserNav() {
  const pathname = usePathname();

  const items = [
    {
      label: "My Reports",
      href: "/user/my-reports",
      icon: ClipboardList,
    },
    {
      label: "Pulse",
      href: "/user/pulse",
      icon: HeartPulse,
    },
  ];

  const updatesActive = pathname?.startsWith("/user/updates") ?? false;

  return (
    /*
     * hidden on mobile — the BottomTabBar covers the same nav items there.
     * md:block restores the fixed header on tablet+.
     */
    <header className="hidden md:block fixed top-0 inset-x-0 z-40 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl supports-[backdrop-filter]:bg-black/50">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/user/my-reports"
          className="group inline-flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-white outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
        >
          <span
            className="h-2 w-2 rounded-full bg-[#0a84ff] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
            aria-hidden="true"
          />
          Civic
        </Link>

        <nav className="flex min-w-0 shrink items-center gap-2" aria-label="Resident views">
          {/* Segmented control track */}
          <div className="flex min-w-0 items-center gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5">
            {items.map(({ label, href, icon: Icon }) => {
              const active = pathname?.startsWith(href) ?? false;
              return (
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
              );
            })}
            <UpdatesPopover active={updatesActive} />
          </div>

          <Link
            href="/report"
            aria-label="Report an issue"
            title="Report an issue"
            className={[
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#0a84ff] px-2.5 sm:px-3 text-[13px] font-medium text-white",
              "transition-colors duration-150 outline-none",
              "hover:bg-[#0070e0]",
              "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
            ].join(" ")}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">Report an issue</span>
          </Link>

          <Link
            href="/city/cumming"
            className="hidden shrink-0 text-[13px] font-medium text-zinc-500 outline-none transition-colors hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0 sm:inline"
          >
            Public view
          </Link>
        </nav>
      </div>
    </header>
  );
}
