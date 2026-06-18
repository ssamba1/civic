"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 h-16 pt-safe transition-[background-color,border-color,backdrop-filter] duration-200",
        scrolled
          ? "border-b border-[var(--color-border)] bg-white/70 backdrop-blur-[14px]"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-8 sm:px-12 lg:px-20">
        <Link
          href="/"
          className="font-display inline-flex min-h-[44px] items-center text-[20px] font-medium tracking-[-0.01em] text-[var(--color-foreground)]"
        >
          Civic<span className="text-[var(--color-primary)]">.</span>
        </Link>

        <nav
          className="hidden md:flex items-center gap-7"
          aria-label="Main navigation"
        >
          <Link
            href="/user/map"
            className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60 focus-visible:ring-offset-2 rounded"
          >
            Dashboard
          </Link>
          <Link
            href="/staff"
            className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60 focus-visible:ring-offset-2 rounded"
          >
            For cities
          </Link>
        </nav>

        <Button asChild size="sm" variant="primary" className="min-h-[44px]">
          <Link href="/report">Report an issue</Link>
        </Button>
      </div>
    </header>
  );
}
