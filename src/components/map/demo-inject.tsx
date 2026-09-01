"use client";

import { RotateCcw, Zap } from "lucide-react";
import { DEMO_MODE } from "@/lib/demo-mode";
import { useDemoReports } from "@/lib/demo-reports";

/**
 * Presenter control for the live-injection beat on the city map.
 *
 * lib/demo-reports.ts has always described this: "a presenter clicks Refresh to
 * inject a live demo data point … and it appears across every client surface".
 * The store, the localStorage persistence, the glow styling and the map-side
 * consumer were all written. Nothing ever called `add()` or `reset()`, so the
 * feature the module documents did not exist. This is that button.
 *
 * Demo-mode only: on a live deployment injecting a fake report onto a real
 * city's map would be indefensible, so the component renders nothing.
 */
export function DemoInject() {
  const { demoReports, add, reset } = useDemoReports();

  if (!DEMO_MODE) return null;

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-[var(--radius-md)] border border-hairline bg-glass px-1.5 py-1 backdrop-blur-md">
      <span className="pl-1 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
        Demo
      </span>
      <button
        type="button"
        onClick={() => add()}
        title="Drop a new report onto the map, live"
        className="flex min-h-[32px] items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <Zap className="h-3.5 w-3.5" aria-hidden />
        Inject report
      </button>
      {demoReports.length > 0 && (
        <button
          type="button"
          onClick={reset}
          title={`Clear ${demoReports.length} injected report(s)`}
          className="flex min-h-[32px] items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-[11px] font-medium text-subtle transition-colors hover:bg-overlay hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset ({demoReports.length})
        </button>
      )}
    </div>
  );
}
