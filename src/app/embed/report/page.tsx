import type { Metadata } from "next";
import Link from "next/link";

/* ==================================================================
   Embeddable "Report an issue" widget (NEXT_100 #80).

   A drop-in card any city website can iframe: <iframe src=".../embed/report">.
   Minimal, chromeless, and links out to the full report flow in a new top-level
   window (target=_top) so it escapes the iframe. No auth, no data. Pure entry
   point, so it's safe to embed anywhere.
   ================================================================== */

export const metadata: Metadata = {
  title: "Report an issue | Civic",
  robots: { index: false, follow: false },
};

export default function EmbedReportWidget() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-transparent p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-hairline bg-surface p-5 text-foreground shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
            aria-hidden="true"
          />
          <span className="text-[13px] font-semibold tracking-tight">
            Civic
          </span>
        </div>
        <h1 className="text-[18px] font-semibold tracking-tight">
          See something broken?
        </h1>
        <p className="mt-1 text-[13px] text-subtle">
          Snap a photo. AI files the work order and you can track the fix. No
          account needed.
        </p>
        <Link
          href="/report"
          target="_top"
          className="mt-4 inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-[14px] font-medium text-[var(--accent-contrast)] hover:bg-[var(--color-primary-hover)]"
        >
          Report an issue
        </Link>
      </div>
    </main>
  );
}
