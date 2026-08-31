"use client";

import { ArrowLeftRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { DEMO_MODE, DEMO_SITE_URL, TESTING_SITE_URL } from "@/lib/demo-mode";

/**
 * Demo ⇄ Testing deployment switch. Rendered on both deployments of a paired
 * install: the demo build (NEXT_PUBLIC_DEMO_MODE unset) links to the testing
 * site, the live build (=0) links back to the demo. A plain anchor — the target
 * is a different origin, so client routing doesn't apply. Carries the current
 * path across so the viewer lands on the same page in the other environment.
 *
 * Renders NOTHING when its target is unset. Pairing is opt-in: a
 * single-deployment install has no counterpart, and a button that navigates a
 * viewer off the product is worse than no button at all.
 */
export function EnvSwitch() {
  const pathname = usePathname();
  const target = DEMO_MODE ? TESTING_SITE_URL : DEMO_SITE_URL;
  const label = DEMO_MODE ? "Testing" : "Demo";

  if (!target) return null;

  return (
    <a
      href={`${target}${pathname}`}
      title={
        DEMO_MODE
          ? "Switch to the live testing site (no demo data)"
          : "Switch to the demo site (sample city data)"
      }
      className={[
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 sm:px-2.5 text-[13px] font-medium",
        "border-hairline bg-overlay text-subtle",
        "transition-colors duration-150 outline-none",
        "hover:bg-overlay-strong hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
      ].join(" ")}
    >
      <ArrowLeftRight
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="hidden md:inline">{label}</span>
      <span className="sr-only md:hidden">Switch to {label} site</span>
    </a>
  );
}
