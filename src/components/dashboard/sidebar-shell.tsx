"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface SidebarSubItem {
  label: string;
  href: string;
  active: boolean;
  /** Small identity dot (e.g. team color) rendered in place of an icon. */
  dotColor?: string;
}

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  /** Optional nested sub-tabs, disclosed via a chevron. */
  sub?: SidebarSubItem[];
}

const STORAGE_KEY = "civic.sidebar-collapsed";

const SidebarCollapsedContext = createContext(false);

export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

/** Renders children only while the sidebar is expanded. */
export function SidebarWhenExpanded({
  children,
}: {
  children: React.ReactNode;
}) {
  return useSidebarCollapsed() ? null : children;
}

/** Renders children only while the sidebar is collapsed to the icon rail. */
export function SidebarWhenCollapsed({
  children,
}: {
  children: React.ReactNode;
}) {
  return useSidebarCollapsed() ? children : null;
}

/** Brand row — Civic dot + wordmark, links home. */
export function SidebarBrand() {
  return (
    <Link
      href="/"
      className="group inline-flex shrink-0 items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden="true" />
      Civic
    </Link>
  );
}

/** Vertical nav section: mono eyebrow heading + icon rows + optional sub-tabs. */
export function SidebarNav({
  heading,
  items,
}: {
  heading: string;
  items: SidebarNavItem[];
}) {
  const collapsed = useSidebarCollapsed();
  // Disclosure state per parent href; groups with an active sub start open.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      items
        .filter((i) => i.sub?.some((s) => s.active))
        .map((i) => [i.href, true]),
    ),
  );

  return (
    <nav aria-label={heading} className="flex flex-col gap-0.5">
      {!collapsed && (
        <p className="px-2.5 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
          {heading}
        </p>
      )}
      {items.map(({ label, href, icon: Icon, active, sub }) => {
        const expanded = open[href] ?? false;
        return (
          <div key={href}>
            <div className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  // Efferd register: compact 32px rows, 13px labels, quiet
                  // elevated pill on the active row — no inverted icon chip.
                  "group relative flex h-8 w-full items-center gap-2.5 rounded-md text-[13px]",
                  "transition-colors duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
                  collapsed
                    ? "justify-center px-0"
                    : sub
                      ? "pl-2.5 pr-8"
                      : "px-2.5",
                  active
                    ? "bg-elevated font-medium text-foreground"
                    : "font-medium text-subtle hover:bg-overlay hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors duration-150",
                    active
                      ? "text-foreground"
                      : "text-faint group-hover:text-subtle",
                  )}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {!collapsed && label}
              </Link>
              {sub && !collapsed && (
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [href]: !expanded }))}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Hide" : "Show"} ${label} sub-tabs`}
                  className="absolute right-1 top-1/2 inline-flex h-[28px] w-[28px] -translate-y-1/2 items-center justify-center rounded-md text-faint outline-none transition-colors hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-150",
                      expanded && "rotate-90",
                    )}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            {sub && expanded && !collapsed && (
              <div className="mt-0.5 mb-1 ml-[1.15rem] flex flex-col gap-px pl-2.5">
                {sub.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    aria-current={s.active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-[12.5px] font-medium",
                      "transition-colors duration-150 outline-none",
                      "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
                      s.active
                        ? "text-accent-text"
                        : "text-subtle hover:bg-overlay hover:text-foreground",
                    )}
                  >
                    {s.dotColor ? (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.dotColor }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="truncate">{s.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Enterprise left-rail shell (desktop md+ only; mobile keeps the fixed top
 * header). Sticky flex column — the dashboard layouts switch to md:flex-row,
 * so content width is managed by flexbox instead of per-page padding offsets.
 * Collapses to an icon rail; state persists in localStorage. The server
 * renders expanded and the stored state applies after hydration.
 */
export function SidebarShell({
  context,
  footer,
  children,
}: {
  /** Slot under the brand row — city switcher / team identity. Hidden while collapsed. */
  context?: React.ReactNode;
  /** Pinned bottom slot — actions, sign-out. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
      <aside
        className={cn(
          // h-dvh resolves BEFORE the html zoom scales it (see --app-zoom in
          // globals.css) — divide it back out or the rail (and the map layout
          // that keys off it) paints 10% short, leaving a dead band.
          "sticky top-0 z-30 hidden h-[calc(100dvh/var(--app-zoom,1))] shrink-0 flex-col border-r border-hairline bg-background md:flex",
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center",
            collapsed ? "justify-center px-0" : "justify-between pl-4 pr-2",
          )}
        >
          {!collapsed && <SidebarBrand />}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-md p-1.5 text-faint outline-none transition-colors hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {collapsed ? (
              <PanelLeftOpen
                className="h-4 w-4"
                strokeWidth={2}
                aria-hidden="true"
              />
            ) : (
              <PanelLeftClose
                className="h-4 w-4"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
          </button>
        </div>
        {context && !collapsed ? (
          <div className="shrink-0 px-3 pb-2 pt-0.5">{context}</div>
        ) : null}
        <div
          className={cn(
            "flex-1 overflow-y-auto py-3",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "shrink-0 border-t border-hairline pb-3 pt-3",
              collapsed ? "px-2" : "px-3",
            )}
          >
            {footer}
          </div>
        ) : null}
      </aside>
    </SidebarCollapsedContext.Provider>
  );
}
