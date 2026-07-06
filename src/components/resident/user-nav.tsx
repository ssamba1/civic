"use client";

import { Camera, FileText, HeartPulse } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnvSwitch } from "@/components/env-switch";
import { UpdatesPopover } from "@/components/resident/updates-popover";
import { ThemeToggle } from "@/components/theme-toggle";
import { ViewSwitch } from "@/components/view-switch";

export function UserNav({ citySlug }: { citySlug?: string }) {
  const pathname = usePathname();

  const items = [
    {
      label: "My Reports",
      href: "/user/my-reports",
      icon: FileText,
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
    <header className="hidden md:block fixed top-0 inset-x-0 z-40 border-b border-hairline bg-glass backdrop-blur-xl supports-[backdrop-filter]:bg-glass">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/user/pulse"
          className="group inline-flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
        >
          <span
            className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          Civic
        </Link>

        <nav
          className="flex min-w-0 shrink items-center gap-2"
          aria-label="Resident views"
        >
          {/* Segmented control track */}
          <div className="flex min-w-0 items-center gap-0.5 rounded-[10px] border border-hairline bg-overlay p-0.5">
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
                    "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus-visible:ring-offset-0",
                    active
                      ? "bg-overlay-strong text-foreground shadow-[inset_0_0_0_1px_var(--hairline)]"
                      : "text-subtle hover:bg-overlay hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon
                    className={[
                      "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
                      active
                        ? "text-[var(--color-primary)]"
                        : "text-faint group-hover:text-subtle",
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
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-2.5 sm:px-3 text-[13px] font-medium text-[var(--accent-contrast)]",
              "transition-colors duration-150 outline-none",
              "hover:bg-[var(--color-primary-hover)]",
              "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            ].join(" ")}
          >
            <Camera
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Report an issue</span>
          </Link>

          <ViewSwitch citySlug={citySlug} />
          <EnvSwitch />
          {/* Light ⇄ dark theme toggle — mirrors CityNav's placement. */}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
