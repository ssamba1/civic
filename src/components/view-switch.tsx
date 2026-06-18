"use client";

import { Building2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

/**
 * Two-state surface toggle: Resident ("User") ⇄ public city dashboard ("City").
 * Active segment is derived from the path (/user* → User, else City). Staff is
 * intentionally excluded — this never exposes the admin surface.
 */
export function ViewSwitch({
  citySlug = "cumming",
  className = "",
}: {
  /** Which city the "City" segment links to. Defaults to the demo city. */
  citySlug?: string;
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  const onUser = pathname.startsWith("/user");

  const segments = [
    {
      key: "user",
      label: "User",
      href: "/user/pulse",
      icon: Users,
      active: onUser,
    },
    {
      key: "city",
      label: "City",
      href: `/city/${citySlug}`,
      icon: Building2,
      active: !onUser,
    },
  ];

  return (
    // biome-ignore lint/a11y/useSemanticElements: role="group" intentional — <fieldset> adds default border/margin/min-width styling and needs a <legend>, breaking this compact pill toggle's layout
    <div
      role="group"
      aria-label="Switch view"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-[10px] border border-hairline bg-overlay p-0.5",
        className,
      )}
    >
      {segments.map(({ key, label, href, icon: Icon, active }) => (
        <Link
          key={key}
          href={href}
          aria-current={active ? "page" : undefined}
          aria-label={`${label} view`}
          title={`${label} view`}
          className={cn(
            "group relative inline-flex h-7 items-center gap-1.5 rounded-md px-2 sm:px-2.5 text-[13px] font-medium",
            "transition-colors duration-150 outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
            active
              ? "bg-overlay-strong text-foreground shadow-[inset_0_0_0_1px_var(--hairline)]"
              : "text-subtle hover:bg-overlay hover:text-foreground",
          )}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
              active ? "text-[#0a84ff]" : "text-faint group-hover:text-subtle",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </div>
  );
}
