"use client";

import type { Promotion } from "@/lib/camera-demo/promotions";
import { contractFor } from "@/lib/camera-demo/vendors";

/**
 * Sidebar: one card per promoted cluster, each walking the real pipeline's
 * stages on a scripted clock. Pure function of (promotions, now) so scrubbing
 * the video back and forth replays identically.
 */

interface Stage {
  label: string;
  detail: (p: Promotion) => string;
  /** Seconds after promotion at which this stage completes. */
  doneAt: number;
}

const STAGES: Stage[] = [
  {
    label: "Damage detected",
    detail: (p) => `pothole · conf ${(p.peakConf * 100).toFixed(0)}%`,
    doneAt: 0,
  },
  {
    label: "Cluster confirmed",
    detail: (p) => `${p.observationCount} observations, repeat passes`,
    doneAt: 0.7,
  },
  {
    label: "Privacy blur",
    detail: () => "faces / plates scrubbed server-side",
    doneAt: 1.5,
  },
  {
    label: "Classified",
    detail: () => "Gemini · severity graded · work order drafted",
    doneAt: 2.4,
  },
  {
    label: "Liability check",
    detail: (p) => {
      const v = contractFor(p);
      return `${v.vendor} · ${v.contractRef} · warranty ${v.daysLeft}d left`;
    },
    doneAt: 3.6,
  },
  {
    label: "Claim packet drafted",
    detail: () => "queued for staff review. Nothing auto-sends",
    doneAt: 4.8,
  },
];

function StageRow({
  stage,
  p,
  elapsed,
}: {
  stage: Stage;
  p: Promotion;
  elapsed: number;
}) {
  const done = elapsed >= stage.doneAt;
  const active = !done && elapsed >= stage.doneAt - 0.9;
  if (!done && !active) return null;
  return (
    <li className="flex items-start gap-2 text-xs">
      {done ? (
        <span aria-hidden className="mt-0.5 text-foreground">
          ✓
        </span>
      ) : (
        <span
          aria-hidden
          className="mt-0.5 inline-block size-3 animate-spin rounded-full border border-muted-foreground border-t-transparent"
        />
      )}
      <span>
        <span className={done ? "text-foreground" : "text-muted-foreground"}>
          {stage.label}
        </span>
        {done && (
          <span className="block text-muted-foreground">{stage.detail(p)}</span>
        )}
      </span>
    </li>
  );
}

export function AgentFeed({
  promotions,
  now,
  onSelect,
}: {
  promotions: Promotion[];
  now: number;
  onSelect: (p: Promotion) => void;
}) {
  const live = promotions.filter((p) => p.time <= now);
  return (
    <aside
      aria-label="Agent activity"
      className="flex h-full flex-col gap-3 overflow-y-auto"
    >
      <header>
        <h2 className="font-medium text-sm">Agents</h2>
        <p className="text-muted-foreground text-xs">
          One spins off per confirmed defect: evidence, classification,
          liability, claim.
        </p>
      </header>
      {live.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
          Watching the feed, agents appear when a defect is confirmed across
          repeat passes.
        </p>
      )}
      {[...live].reverse().map((p) => {
        const elapsed = now - p.time;
        const settled = elapsed >= STAGES[STAGES.length - 1].doneAt;
        return (
          // The card holds an <ol>, which a <button> may not contain, so the
          // button is a stretched overlay instead of a wrapper. Same hit area,
          // valid HTML, and real keyboard/AT semantics.
          <section
            key={p.id}
            className="relative rounded-md border bg-card p-3 shadow-sm transition-colors hover:bg-muted/40"
          >
            <button
              type="button"
              className="absolute inset-0 z-10 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              onClick={() => onSelect(p)}
              aria-label={`Open claim detail for ${p.id}`}
            />
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs">
                Agent · {p.id.replace("promo-", "cluster ")}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  settled
                    ? "bg-muted text-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {settled ? "claim drafted" : "working"}
              </span>
            </div>
            <ol className="mt-2 space-y-1.5">
              {STAGES.map((s) => (
                <StageRow key={s.label} stage={s} p={p} elapsed={elapsed} />
              ))}
            </ol>
          </section>
        );
      })}
    </aside>
  );
}
