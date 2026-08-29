"use client";

import { CloudOff, MapPin, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { useReportCorpus } from "@/lib/filters/context";
import { severityHue } from "@/lib/severity-colors";
import { timeAgo } from "@/lib/utils/time-ago";

/* ==================================================================
   Field-crew view (NEXT_100 #52).

   A phone-first, low-connectivity list of the team's open work orders — the
   thing SeeClickFix explicitly can't do. Reads the team-locked corpus (via the
   parent layout's FilterProvider), so it's the SAME data the console shows.
   The service worker caches this route network-first (see public/sw.js), so a
   crew that loses signal still sees the last-synced list instead of a dead
   screen; an offline banner makes the staleness honest.

   Scope: read-optimized list + map links. Mark-complete stays in the full task
   flow on the team overview (it requires the reason + after-photo close). An
   offline write-queue for mark-complete is a follow-up.
   ================================================================== */

export default function FieldViewPage() {
  const corpus = useReportCorpus();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const open = corpus
    .filter((r) => r.status !== "closed" && r.status !== "rejected")
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        Date.parse(a.created_at) - Date.parse(b.created_at),
    );

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pt-city-content pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-4">
      <section className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Field queue
        </h1>
        <p className="text-[13px] text-faint">
          {open.length} open {open.length === 1 ? "job" : "jobs"} · sorted by
          severity
        </p>
      </section>

      {!online && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/[0.08] px-3 py-2 text-[13px] text-[var(--status-warning-fg)]">
          <CloudOff className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
          Offline — showing the last synced queue. Changes will need a
          connection.
        </div>
      )}

      {open.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-hairline bg-surface p-6 text-center text-[14px] text-faint">
          No open jobs — the queue is clear.
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {open.map((r) => {
            const meta = CATEGORY_META[r.category] ?? CATEGORY_META.other;
            const hue = severityHue(r.severity);
            const mapsHref = `https://www.google.com/maps/search/?api=1&query=${r.location.lat},${r.location.lng}`;
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-hairline bg-surface p-3"
              >
                <span
                  role="img"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-[13px] font-bold tabular-nums"
                  style={{ backgroundColor: `${hue}1f`, color: hue }}
                  aria-label={`Severity ${r.severity}`}
                >
                  {r.severity}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[14px] font-medium text-foreground">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden="true"
                    />
                    {meta.label}
                  </span>
                  <span className="flex items-center gap-1 truncate text-[12px] text-subtle">
                    <MapPin
                      className="h-3 w-3 flex-shrink-0"
                      strokeWidth={1.75}
                    />
                    {r.address} · {timeAgo(r.created_at)}
                  </span>
                </div>
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Navigate"
                  className="ml-auto inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-hairline text-foreground hover:bg-overlay"
                >
                  <Navigation className="h-4 w-4" strokeWidth={1.75} />
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
