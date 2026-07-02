"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";

/**
 * Light ⇄ dark toggle. Dogfoods the semantic tokens (text-faint, border-hairline,
 * bg-overlay…) so it themes itself. The visible icon is CSS-driven via the `dark:`
 * variant — correct before JS hydrates — while the click handler flips the store
 * (src/lib/theme.ts), which toggles the `dark` class on <html> and persists it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-faint",
        "border-hairline bg-overlay transition-colors duration-150 outline-none",
        "hover:bg-overlay-strong hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
        className,
      )}
    >
      <Sun
        className="hidden h-3.5 w-3.5 dark:block"
        strokeWidth={2}
        aria-hidden="true"
      />
      <Moon
        className="block h-3.5 w-3.5 dark:hidden"
        strokeWidth={2}
        aria-hidden="true"
      />
    </button>
  );
}
