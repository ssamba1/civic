"use client";

import {
  Building2,
  KeyRound,
  LandPlot,
  PlusCircle,
  QrCode,
  Shield,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/admin/cities", label: "Cities", icon: Building2 },
  { href: "/admin/onboard", label: "Onboard a city", icon: PlusCircle },
  { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
  { href: "/admin/privacy", label: "Privacy audit", icon: ShieldCheck },
  { href: "/admin/districts", label: "District rollups", icon: LandPlot },
  { href: "/admin/qr", label: "Walk-up QR", icon: QrCode },
  { href: "/staff", label: "Staff console", icon: Shield },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin/cities"
    ? pathname.startsWith("/admin/cities")
    : pathname.startsWith(href);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800",
            )}
          >
            <item.icon className="h-5 w-5" />
          </Link>
        );
      })}
    </div>
  );
}
