"use client";

import { ArrowUpRight, HelpCircle } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { MemberModalShell } from "@/components/members/member-modal";
import { cn } from "@/lib/utils/cn";
import { guideForPath, guideKeyForPath } from "./guide-content";

/* ==================================================================
   "What is this page?" — the demo guide.

   Opened from the city or resident sidebar footer. Reads the current
   route and answers it with one centred dialog: a screenshot of the
   page, then what the surface is, what is on it, and why it exists.

   The screenshot leads deliberately. A first-time viewer recognises a
   layout faster than they read a description of it, so the picture
   does the orienting and the prose does the explaining. Entries whose
   route has no captured instance render the same dialog without the
   figure — no placeholder, no reserved gap.
   ================================================================== */

/** Trigger for the sidebar footer. Sized as a peer of ThemeToggle. */
export function PageGuideButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="About this page"
        title="About this page"
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-faint",
          "border-hairline bg-overlay transition-colors duration-150 outline-none",
          "hover:bg-overlay-strong hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-0",
          className,
        )}
      >
        <HelpCircle
          className="h-3.5 w-3.5"
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
      {open && <PageGuideDialog onClose={() => setOpen(false)} />}
    </>
  );
}

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wide text-faint";

/** The capture's own frame (scripts/shot-guide.mjs), used to reserve its box. */
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 800;

/**
 * Alt text carries the page's identity plus its opening claim, so a screen
 * reader gets the same orientation the picture gives everyone else rather
 * than "screenshot".
 */
function altFor(title: string, what: string) {
  const firstSentence = what.split(". ")[0].replace(/\.$/, "");
  return `Screenshot of the ${title} page: ${firstSentence}.`;
}

function PageGuideDialog({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const key = guideKeyForPath(pathname);
  const guide = guideForPath(pathname);

  // Not every guide entry has a capture: routes with a dynamic segment that
  // the demo corpus holds no instance of ship without one on purpose, rather
  // than borrowing a different page's picture. The 404 is expected, so it
  // collapses the figure instead of leaving a broken frame.
  // The dialog is mounted only while open, so this resets on every open.
  const [hasShot, setHasShot] = useState(true);

  return (
    <MemberModalShell
      title={guide.title}
      subtitle={<span className="font-mono">{pathname}</span>}
      icon={<HelpCircle className="h-4 w-4" strokeWidth={1.75} />}
      onClose={onClose}
      size="wide"
    >
      <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-5">
        {hasShot && (
          <Image
            src={`/guide/${key.replaceAll("/", "-")}.png`}
            alt={altFor(guide.title, guide.what)}
            width={SHOT_WIDTH}
            height={SHOT_HEIGHT}
            onError={() => setHasShot(false)}
            priority
            // Sits on the app's own background so a dark capture inside a light
            // dialog reads as a framed picture rather than a hole in the panel.
            className="h-auto w-full rounded-[var(--radius-md)] border border-hairline bg-background"
          />
        )}

        <section className="space-y-2">
          <h3 className={SECTION_LABEL}>What this is</h3>
          <p className="text-[13px] leading-relaxed text-subtle">
            {guide.what}
          </p>
        </section>

        {guide.points.length > 0 && (
          <section className="space-y-2">
            <h3 className={SECTION_LABEL}>On this screen</h3>
            <ul className="flex flex-col gap-3">
              {guide.points.map((point) => (
                <li key={point.label} className="flex gap-2.5">
                  <span
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">
                      {point.label}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-faint">
                      {point.text}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h3 className={SECTION_LABEL}>Why it matters</h3>
          <ul className="flex flex-col gap-2.5">
            {guide.why.map((line) => (
              <li
                key={line}
                className="flex gap-2.5 text-[12.5px] leading-relaxed text-subtle"
              >
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint"
                  aria-hidden="true"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
        {guide.readmeHref ? (
          <a
            href={guide.readmeHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-md text-[12.5px] font-medium text-accent-text outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span className="truncate">{guide.readmeLabel}</span>
            <ArrowUpRight
              className="h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
          </a>
        ) : (
          <span className="text-[12.5px] text-faint">Esc to close</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-hairline bg-overlay px-3 py-1.5 text-[12.5px] font-medium text-subtle outline-none transition-colors hover:bg-overlay-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Done
        </button>
      </footer>
    </MemberModalShell>
  );
}
