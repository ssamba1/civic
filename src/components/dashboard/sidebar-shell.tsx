import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
}

/** Brand row — Civic dot + wordmark, links home. Shared by both sidebars. */
export function SidebarBrand() {
  return (
    <Link
      href="/"
      className="group inline-flex shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60"
    >
      <span
        className="h-2 w-2 rounded-full bg-[#0a84ff] shadow-[0_0_8px_rgba(10,132,255,0.6)]"
        aria-hidden="true"
      />
      Civic
    </Link>
  );
}

/** Vertical nav section: mono eyebrow heading + full-width icon rows. */
export function SidebarNav({
  heading,
  items,
}: {
  heading: string;
  items: SidebarNavItem[];
}) {
  return (
    <nav aria-label={heading} className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
        {heading}
      </p>
      {items.map(({ label, href, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium",
            "transition-colors duration-150 outline-none",
            "focus-visible:ring-2 focus-visible:ring-[#0a84ff]/60 focus-visible:ring-offset-0",
            active
              ? "bg-overlay-strong text-foreground shadow-[inset_0_0_0_1px_var(--hairline)]"
              : "text-subtle hover:bg-overlay hover:text-foreground",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors duration-150",
              active ? "text-[#0a84ff]" : "text-faint group-hover:text-subtle",
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Enterprise left-rail shell (desktop md+ only; mobile keeps the fixed top
 * header). Sticky flex column — the dashboard layouts switch to md:flex-row,
 * so content width is managed by flexbox instead of per-page padding offsets.
 */
export function SidebarShell({
  context,
  footer,
  children,
}: {
  /** Slot under the brand row — city switcher / team identity. */
  context?: React.ReactNode;
  /** Pinned bottom slot — actions, sign-out. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 z-30 hidden h-dvh w-60 shrink-0 flex-col border-r border-hairline bg-background md:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-hairline px-4">
        <SidebarBrand />
      </div>
      {context ? (
        <div className="shrink-0 border-b border-hairline px-3 py-3">
          {context}
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto px-3 py-4">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-hairline px-3 py-3">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
