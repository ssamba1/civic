"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Building2 } from "lucide-react";

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
    { key: "user", label: "User", href: "/user/pulse", icon: Users, active: onUser },
    {
      key: "city",
      label: "City",
      href: `/city/${citySlug}`,
      icon: Building2,
      active: !onUser,
    },
  ];

  return (
    <div
      role="group"
      aria-label="Switch view"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-0.5",
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
              ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
              : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
          )}
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors duration-150",
              active ? "text-[#0a84ff]" : "text-zinc-500 group-hover:text-zinc-300",
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
