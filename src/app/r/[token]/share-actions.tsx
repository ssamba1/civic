"use client";

import { Check, Copy, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/* Persistent next-action row for the account-less status page. The page is a
   Server Component, so the copy affordance (needs navigator.clipboard) lives
   here as a client island. "Copy this link" grabs the current bookmarkable URL
   so the resident can actually save the anon tracker; "Report another issue"
   keeps the flow from dead-ending after the status read. */
export function ShareActions() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions). Leave the label
      // as-is rather than claiming a copy that didn't happen.
    }
  }

  return (
    <div className="mt-8 flex flex-wrap gap-3 border-t border-hairline pt-6">
      <button
        type="button"
        onClick={copyLink}
        aria-live="polite"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] border border-hairline bg-overlay px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-overlay-strong"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Link copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Copy this link
          </>
        )}
      </button>
      <Link
        href="/report"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-[13px] font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Report another issue
      </Link>
    </div>
  );
}
