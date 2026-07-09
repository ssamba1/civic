"use client";

import { useState } from "react";
import { reopenReport } from "./actions";

/** "Still broken?" one-tap reopen for the public status page (#7). Possession
 *  of the page's token authorizes it (server action re-checks). */
export function ReopenButton({
  token,
  label,
  confirmLabel,
  doneLabel,
}: {
  token: string;
  label: string;
  confirmLabel: string;
  doneLabel: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );

  if (state === "done") {
    return (
      <p className="text-[13px] font-medium text-foreground">{doneLabel}</p>
    );
  }

  async function onClick() {
    setState("busy");
    const res = await reopenReport(token);
    setState(res.ok ? "done" : "error");
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={state === "busy"}
        className="inline-flex w-fit items-center rounded-md border border-hairline px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-overlay disabled:opacity-60"
      >
        {state === "busy" ? confirmLabel : label}
      </button>
      {state === "error" && (
        <span className="text-[12px] text-[var(--status-danger-fg)]">
          Couldn&apos;t reopen — try again.
        </span>
      )}
    </div>
  );
}
