"use client";

import type { CrewRouteResult, CrewRouteStop } from "@/app/staff/route-actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ---------------------------------------------------------------------------
// SVG polyline sketch
// ---------------------------------------------------------------------------

interface SvgRouteSketchProps {
  stops: CrewRouteStop[];
}

/**
 * A simple SVG polyline that sketches the route shape.
 * Coordinates are the report lat/lng normalised into a 300×200 viewBox.
 * No map tiles, no external dependencies.
 */
function SvgRouteSketch({ stops }: SvgRouteSketchProps) {
  const located = stops.filter(
    (s): s is typeof s & { location: NonNullable<typeof s.location> } =>
      s.location !== null,
  );
  if (located.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[var(--radius-md)] border border-hairline bg-surface text-[13px] text-faint">
        Not enough location data for sketch
      </div>
    );
  }

  const lats = located.map((s) => s.location.lat);
  const lngs = located.map((s) => s.location.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const PAD = 20; // px padding inside viewBox
  const W = 300;
  const H = 200;
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD;

  const latSpan = maxLat - minLat || 0.001;
  const lngSpan = maxLng - minLng || 0.001;

  function toSvg(lat: number, lng: number): [number, number] {
    // SVG y increases downward; latitude increases upward → invert lat.
    const x = PAD + ((lng - minLng) / lngSpan) * innerW;
    const y = PAD + ((maxLat - lat) / latSpan) * innerH;
    return [x, y];
  }

  const points = located.map((s) => toSvg(s.location.lat, s.location.lng));
  const polyline = points.map(([x, y]) => `${x},${y}`).join(" ");

  // Index of each stop in located[] for label positioning.
  const labels = located.map((s, i) => {
    const [x, y] = points[i]!;
    return { x, y, seq: s.sequence };
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-[var(--radius-md)] border border-hairline bg-surface"
      aria-label="Route sketch"
      role="img"
    >
      {/* Route line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="hsl(var(--color-brand))"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Dots + sequence labels */}
      {labels.map(({ x, y, seq }) => (
        <g key={seq}>
          <circle
            cx={x}
            cy={y}
            r={8}
            fill="hsl(var(--color-brand))"
            opacity="0.15"
          />
          <circle cx={x} cy={y} r={4} fill="hsl(var(--color-brand))" />
          <text
            x={x + 7}
            y={y - 6}
            fontSize={9}
            fill="hsl(var(--color-foreground))"
            fontFamily="system-ui, sans-serif"
          >
            {seq}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stop card
// ---------------------------------------------------------------------------

interface StopCardProps {
  stop: CrewRouteStop;
}

function StopCard({ stop }: StopCardProps) {
  return (
    <li className="flex gap-3 rounded-[var(--radius-md)] border border-hairline bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
      {/* Sequence badge */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
        {stop.sequence}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {stop.address ?? "Unknown address"}
        </p>

        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-faint">
          {stop.category && (
            <span className="capitalize">
              {stop.category.replace(/_/g, " ")}
            </span>
          )}
          <span className="capitalize">{stop.status.replace(/_/g, " ")}</span>
          {stop.sequence > 1 && (
            <span>+ {formatMeters(stop.legMeters)} from prev</span>
          )}
          {!stop.location && (
            <span className="text-amber-500">No location data</span>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// RoutePlan (exported)
// ---------------------------------------------------------------------------

export interface RoutePlanProps {
  route: CrewRouteResult | null;
  crewName?: string;
}

/**
 * Displays the optimized route for a crew day: ordered stop list, per-leg
 * and total distances, and a simple SVG polyline sketch.
 */
export function RoutePlan({ route, crewName }: RoutePlanProps) {
  if (!route || route.stops.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface px-6 py-16 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-foreground">
          No stops scheduled
        </p>
        <p className="mt-1.5 text-[13px] text-faint">
          {crewName
            ? `${crewName} has no work orders scheduled for this day.`
            : "This crew has no work orders scheduled for this day."}
        </p>
      </div>
    );
  }

  const { stops, stats, twoOptApplied, date } = route;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {crewName ? `${crewName} — ` : ""}Route for {date}
        </h2>
        <p className="text-[13px] text-faint">
          {stats.stopCount} stop{stats.stopCount !== 1 ? "s" : ""} ·{" "}
          {formatMeters(stats.totalMeters)} total
          {twoOptApplied && " · 2-opt improved"}
        </p>
      </div>

      {/* SVG sketch */}
      <SvgRouteSketch stops={stops} />

      {/* Stats strip */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Total distance", formatMeters(stats.totalMeters)],
            ["Avg leg", formatMeters(stats.avgLegMeters)],
            ["Longest leg", formatMeters(stats.longestLegMeters)],
            ["Stops", String(stats.stopCount)],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-[var(--radius-sm)] border border-hairline bg-surface px-3 py-2"
          >
            <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">
              {label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Stop list */}
      <ol className="space-y-2" aria-label="Ordered route stops">
        {stops.map((s) => (
          <StopCard key={s.id} stop={s} />
        ))}
      </ol>

      {stats.stopsWithoutLocation > 0 && (
        <p className="text-[12px] text-faint">
          {stats.stopsWithoutLocation} stop
          {stats.stopsWithoutLocation !== 1 ? "s" : ""} without location data
          placed at end of route.
        </p>
      )}
    </div>
  );
}
