"use client";

import {
  Check,
  CheckCircle2,
  Flame,
  Inbox,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EmptyState,
  ExpandModal,
  PillGroup,
  Prose,
  Stat,
  StatGrid,
  Tile,
  Toggle,
} from "@/components/analytics/bento-primitives";
import {
  TipBar,
  TipChip,
  TipRow,
  useHoverTip,
} from "@/components/analytics/hover-tip";
import type {
  AnalyticsKpis,
  CategoryResolution,
  HeatCell,
  NeighborhoodVolume,
  RecurringHotspot,
  ReporterVelocity,
  ResolutionBucket,
  SeveritySlice,
  StatusFunnelStep,
  TrendPoint,
} from "@/lib/analytics-data";
import type { SlaRisk } from "@/lib/filters/derive";
import { SEVERITY_HUE } from "@/lib/severity-colors";
import { cn } from "@/lib/utils/cn";
import { formatHours } from "@/lib/utils/time-ago";

/* ------------------------------------------------------------------
   Touch-tip helper. Builds pointer-enter/leave + onClick handlers
   that work for both mouse hover and touch tap-to-toggle.
   ------------------------------------------------------------------ */
function useTouchTipBinder(tip: ReturnType<typeof useHoverTip>) {
  const lastPointerType = useRef<string>("mouse");
  const activeKey = useRef<string | null>(null);

  const bind = useCallback(
    <K extends string>(
      key: K,
      tipContent: () => Parameters<typeof tip.show>[0],
      setActive: (k: K | null) => void,
    ) => ({
      onPointerEnter: (e: React.PointerEvent) => {
        lastPointerType.current = e.pointerType;
        if (e.pointerType === "touch") return; // handled by onClick
        setActive(key);
        tip.show(tipContent(), e);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        tip.move(e);
      },
      onPointerLeave: () => {
        if (lastPointerType.current === "touch") return;
        setActive(null);
        tip.hide();
      },
      onClick: (e: React.MouseEvent) => {
        if (lastPointerType.current !== "touch") return;
        if (activeKey.current === key) {
          activeKey.current = null;
          setActive(null);
          tip.hide();
        } else {
          activeKey.current = key;
          setActive(key);
          tip.show(tipContent(), e);
        }
      },
      onFocus: (e: React.FocusEvent) => {
        const r = (e.currentTarget as Element).getBoundingClientRect();
        setActive(key);
        tip.show(tipContent(), {
          clientX: r.left + r.width / 2,
          clientY: r.top,
        });
      },
      onBlur: () => {
        if (activeKey.current === key) activeKey.current = null;
        setActive(null);
        tip.hide();
      },
    }),
    [tip],
  );

  return bind;
}

/* ==================================================================
   1. KPI cards (no expand, quick-glance numbers only)
   ================================================================== */

interface KpiCardsProps {
  kpis: AnalyticsKpis;
}

function KpiCardsInner({ kpis }: KpiCardsProps) {
  const [hoveredKpi, setHoveredKpi] = useState<string | null>(null);
  const tip = useHoverTip();
  const bindTip = useTouchTipBinder(tip);

  // Sensible MTTR target, not in AnalyticsKpis, so we use a civic-ops literal.
  const MTTR_TARGET_HOURS = 48;
  const RESOLUTION_IDEAL = 100;

  type KpiCard = {
    key: string;
    label: string;
    value: string;
    icon: React.ReactNode;
    accent: string;
    delta?: number;
    betterWhenUp?: boolean;
    sub?: string;
    tip: () => Parameters<typeof tip.show>[0];
  };

  const cards: KpiCard[] = useMemo(
    () => [
      {
        key: "resolution",
        label: "Resolution rate",
        value: `${kpis.resolution_rate_pct.toFixed(1)}%`,
        icon: <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />,
        accent: "var(--accent)",
        delta: kpis.resolution_rate_delta_pct,
        betterWhenUp: true,
        tip: () => {
          const gap = RESOLUTION_IDEAL - kpis.resolution_rate_pct;
          const delta = kpis.resolution_rate_delta_pct;
          return {
            title: "Resolution rate",
            accent: "var(--accent)",
            body: (
              <div className="flex flex-col gap-1.5">
                <TipRow
                  label="Current"
                  value={`${kpis.resolution_rate_pct.toFixed(1)}%`}
                />
                <TipRow
                  label="Prior period"
                  value={`${(kpis.resolution_rate_pct - delta).toFixed(1)}%`}
                  muted
                />
                <TipBar pct={kpis.resolution_rate_pct} color="var(--accent)" />
                <p className="text-[11px] text-faint leading-snug mt-1">
                  Share of intake that reached closed. 100% means every report
                  was resolved.
                </p>
              </div>
            ),
            footer: (
              <div className="flex items-center justify-between">
                <span>Gap to ideal: {gap.toFixed(1)}pp</span>
                <TipChip tone={delta >= 0 ? "good" : "bad"}>
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}% vs prior
                </TipChip>
              </div>
            ),
          };
        },
      },
      {
        key: "mttr",
        label: "Mean time to resolve",
        value: formatHours(kpis.mttr_hours),
        icon: <Timer className="h-4 w-4" strokeWidth={1.75} />,
        accent: "var(--accent)",
        delta: kpis.mttr_delta_pct,
        betterWhenUp: false,
        tip: () => {
          const delta = kpis.mttr_delta_pct;
          const days = kpis.mttr_hours / 24;
          const overTarget = kpis.mttr_hours - MTTR_TARGET_HOURS;
          const targetPct = Math.min(
            (MTTR_TARGET_HOURS / Math.max(kpis.mttr_hours, 1)) * 100,
            100,
          );
          return {
            title: "Mean time to resolve",
            accent: "var(--accent)",
            body: (
              <div className="flex flex-col gap-1.5">
                <TipRow label="Raw" value={`${kpis.mttr_hours.toFixed(1)}h`} />
                <TipRow
                  label="Equivalent"
                  value={`${days.toFixed(2)} days`}
                  muted
                />
                <TipRow
                  label={`Target ${MTTR_TARGET_HOURS}h`}
                  value={`${targetPct.toFixed(0)}% headroom`}
                  muted
                />
                <TipBar pct={targetPct} color="var(--accent)" />
                <p className="text-[11px] text-faint leading-snug mt-1">
                  Lower is better. Time from report intake to closed status.
                </p>
              </div>
            ),
            footer: (
              <div className="flex items-center justify-between">
                <span>
                  {overTarget > 0
                    ? `${overTarget.toFixed(1)}h over target`
                    : `${Math.abs(overTarget).toFixed(1)}h under target`}
                </span>
                <TipChip tone={delta <= 0 ? "good" : "bad"}>
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}% vs prior
                </TipChip>
              </div>
            ),
          };
        },
      },
      {
        key: "sla",
        label: "SLA compliance",
        value: `${kpis.sla_compliance_pct.toFixed(1)}%`,
        icon: <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />,
        accent: "var(--accent)",
        sub: `Target ${kpis.sla_target_pct}%`,
        tip: () => {
          const gap = kpis.sla_compliance_pct - kpis.sla_target_pct;
          const passing = kpis.sla_compliance_pct >= kpis.sla_target_pct;
          return {
            title: "SLA compliance",
            accent: "var(--accent)",
            body: (
              <div className="flex flex-col gap-1.5">
                <TipRow
                  label="Current"
                  value={`${kpis.sla_compliance_pct.toFixed(1)}%`}
                />
                <TipRow
                  label="Target"
                  value={`${kpis.sla_target_pct}%`}
                  muted
                />
                <TipBar pct={kpis.sla_compliance_pct} color="var(--accent)" />
                <p className="text-[11px] text-faint leading-snug mt-1">
                  Share of reports closed inside their category SLA window.
                </p>
              </div>
            ),
            footer: (
              <div className="flex items-center justify-between">
                <span>
                  {gap >= 0 ? "+" : ""}
                  {gap.toFixed(1)}pp vs target
                </span>
                <TipChip tone={passing ? "good" : "bad"}>
                  {passing ? "Passing" : "Missing"}
                </TipChip>
              </div>
            ),
          };
        },
      },
      {
        key: "backlog",
        label: "Active backlog",
        value: kpis.active_backlog.toLocaleString(),
        icon: <Inbox className="h-4 w-4" strokeWidth={1.75} />,
        accent: "var(--accent)",
        delta: kpis.backlog_delta_pct,
        betterWhenUp: false,
        tip: () => {
          const delta = kpis.backlog_delta_pct;
          const growing = delta > 0;
          const priorEstimate =
            delta !== 0
              ? Math.round(kpis.active_backlog / (1 + delta / 100))
              : kpis.active_backlog;
          const change = kpis.active_backlog - priorEstimate;
          return {
            title: "Active backlog",
            accent: "var(--accent)",
            body: (
              <div className="flex flex-col gap-1.5">
                <TipRow
                  label="Open now"
                  value={kpis.active_backlog.toLocaleString()}
                />
                <TipRow
                  label="Prior period"
                  value={priorEstimate.toLocaleString()}
                  muted
                />
                <TipRow
                  label="Net change"
                  value={`${change >= 0 ? "+" : ""}${change.toLocaleString()}`}
                  muted
                />
                <p className="text-[11px] text-faint leading-snug mt-1">
                  Reports not yet closed. A growing backlog means intake is
                  outpacing resolution.
                </p>
              </div>
            ),
            footer: (
              <div className="flex items-center justify-between">
                <span>
                  {growing ? "Growing" : delta < 0 ? "Shrinking" : "Flat"}
                </span>
                <TipChip
                  tone={growing ? "bad" : delta < 0 ? "good" : "neutral"}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}% vs prior
                </TipChip>
              </div>
            ),
          };
        },
      },
    ],
    [kpis],
  );

  const bindCard = useCallback(
    (c: KpiCard) =>
      bindTip(c.key, c.tip, (k) => setHoveredKpi(k as string | null)),
    [bindTip],
  );

  // Per-index divider classes: 2-col mobile grid → 4-col desktop row
  const BORDER_CLASSES = [
    "border-r border-b lg:border-b-0 border-hairline",
    "border-b lg:border-b-0 lg:border-r border-hairline",
    "border-r border-hairline",
    "",
  ];

  return (
    <>
      <div className="rounded-[var(--radius-lg)] border border-hairline bg-surface overflow-hidden shadow-[var(--shadow-card)]">
        {/* Say so when these are illustrative. The demo literals (76.5%
            resolution, 64h MTTR, 88.4% SLA) are also the fallback whenever the
            live aggregate errors or a city has no reports yet, so without this
            an unlabelled dashboard presents invented numbers as measured
            outcomes. Mirrors the "Demo data" badge on the onboarding wizard. */}
        {kpis.synthetic && (
          <div className="flex items-center gap-2 border-b border-hairline bg-overlay/60 px-4 py-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]"
              aria-hidden
            />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-subtle">
              Sample data
            </span>
            <span className="text-[11px] text-faint">
              Illustrative figures for the demo corpus, not measured outcomes.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {cards.map((c, idx) => {
            const goodDirection =
              c.delta !== undefined
                ? c.betterWhenUp
                  ? c.delta > 0
                  : c.delta < 0
                : null;
            const isActive = hoveredKpi === c.key;
            const isDim = hoveredKpi !== null && !isActive;
            return (
              // biome-ignore lint/a11y/useSemanticElements: role="group" is the correct intentional semantic for this KPI card cluster; no native equivalent preserves the layout
              <div
                key={c.key}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: intentional keyboard-a11y, focus reveals the hover tooltip via bindCard
                tabIndex={0}
                role="group"
                aria-label={`${c.label}: ${c.value}`}
                className={cn(
                  "relative px-4 sm:px-5 py-4 sm:py-5 min-h-[80px] outline-none cursor-default",
                  "transition-[background,opacity] duration-200 ease-out motion-reduce:transition-none",
                  BORDER_CLASSES[idx],
                  isActive && "bg-overlay",
                  isDim ? "opacity-50" : "opacity-100",
                  "focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-hairline-strong",
                )}
                {...bindCard(c)}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-faint leading-none">
                    {c.label}
                  </span>
                  {c.delta !== undefined && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[11px] tabular-nums",
                        goodDirection
                          ? "text-[var(--status-success-fg)]"
                          : "text-[var(--status-danger-fg)]",
                      )}
                    >
                      {c.delta > 0 ? (
                        <TrendingUp className="h-3 w-3" strokeWidth={2} />
                      ) : (
                        <TrendingDown className="h-3 w-3" strokeWidth={2} />
                      )}
                      {Math.abs(c.delta).toFixed(1)}%
                    </span>
                  )}
                  {c.sub && (
                    <span className="text-[11px] text-faint tabular-nums">
                      {c.sub}
                    </span>
                  )}
                </div>
                <p className="text-[28px] sm:text-[30px] font-semibold tracking-tight tabular-nums leading-none text-foreground">
                  {c.value}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <tip.Portal />
    </>
  );
}

export const KpiCards = memo(KpiCardsInner);

/* ==================================================================
   2. Reports trend
   ================================================================== */

interface ReportsTrendProps {
  data: TrendPoint[];
}

function renderTrendChart(
  data: TrendPoint[],
  w: number,
  h: number,
  showCreated: boolean,
  showClosed: boolean,
  smooth: boolean,
  idPrefix: string,
  opts?: {
    hovered?: number | null;
    bindHover?: (i: number) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  const pad = { l: 32, r: 12, t: 16, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const hoveredIdx = opts?.hovered ?? null;

  // Guard: empty series would crash on pts[0] / data[peakIdx] below.
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: h }}>
        <span className="text-[13px] text-faint">No data in range</span>
      </div>
    );
  }

  const visible: ("created" | "closed")[] = [];
  if (showCreated) visible.push("created");
  if (showClosed) visible.push("closed");

  const max = Math.max(1, ...data.flatMap((d) => visible.map((k) => d[k])));
  const xStep = innerW / Math.max(data.length - 1, 1);
  // Cap axis labels to ~one per 70px so dense ranges (e.g. 90d) don't render an
  // unreadable wall of overlapping dates.
  const maxLabels = Math.max(2, Math.floor(innerW / 70));
  const labelStep = Math.max(1, Math.ceil((data.length - 1) / maxLabels));
  const xy = (i: number, v: number) => ({
    x: pad.l + i * xStep,
    y: pad.t + innerH - (v / max) * innerH,
  });

  const linePath = (key: "created" | "closed") => {
    if (!smooth) {
      return data
        .map((d, i) => {
          const { x, y } = xy(i, d[key]);
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
    }
    // Monotone cubic (Fritsch, Carlson). Passes through every point, so the
    // hover dots stay exactly on the line, but constrains tangents so the curve
    // never overshoots its data envelope. Plain Catmull-Rom overshoots on spiky
    // daily counts, bulging past peaks and dipping the area fill below the
    // baseline wherever a value hits 0.
    const pts = data.map((d, i) => xy(i, d[key]));
    const n = pts.length;
    if (n < 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

    const dx: number[] = [];
    const slope: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const gap = pts[i + 1].x - pts[i].x;
      dx.push(gap);
      slope.push((pts[i + 1].y - pts[i].y) / gap);
    }

    const tan: number[] = new Array(n);
    tan[0] = slope[0];
    tan[n - 1] = slope[n - 2];
    for (let i = 1; i < n - 1; i++) {
      // Flatten the tangent at local extrema (sign change) to kill overshoot.
      tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (slope[i] === 0) {
        tan[i] = 0;
        tan[i + 1] = 0;
        continue;
      }
      const a = tan[i] / slope[i];
      const b = tan[i + 1] / slope[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tan[i] = t * a * slope[i];
        tan[i + 1] = t * b * slope[i];
      }
    }

    let p = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const cp1x = pts[i].x + dx[i] / 3;
      const cp1y = pts[i].y + (tan[i] * dx[i]) / 3;
      const cp2x = pts[i + 1].x - dx[i] / 3;
      const cp2y = pts[i + 1].y - (tan[i + 1] * dx[i]) / 3;
      p += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
    }
    return p;
  };

  const areaPath = (key: "created" | "closed") => {
    const top = linePath(key);
    const last = xy(data.length - 1, 0);
    const first = xy(0, 0);
    return `${top} L ${last.x.toFixed(1)} ${last.y.toFixed(1)} L ${first.x.toFixed(1)} ${first.y.toFixed(1)} Z`;
  };

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round((max / ticks) * i),
  );

  // Per-instance gradient/pattern IDs so the in-tile and expanded charts
  // (mounted simultaneously) don't share a global id. Duplicate ids make the
  // browser resolve url(#…) to the first match, swapping one chart's fill.
  const gCreated = `g-created-${idPrefix}`;
  const pClosed = `hatch-closed-${idPrefix}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="block h-full w-full"
      role="img"
      aria-label="Reports created vs resolved over time"
    >
      <defs>
        {/* Created = primary series, sky soft area fade under a sky-strong line. */}
        <linearGradient id={gCreated} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--pastel-sky)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--pastel-sky)" stopOpacity="0" />
        </linearGradient>
        {/* Resolved = secondary series, mint soft area fade under a
           mint-strong line, so the two series read apart by hue. */}
        <linearGradient id={pClosed} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--pastel-mint)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--pastel-mint)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => {
        const y = pad.t + innerH - (t / max) * innerH;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: yTicks is a static derived axis-tick list that never reorders or filters
          <g key={i}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y}
              y2={y}
              stroke="var(--hairline)"
              strokeWidth={1}
            />
            <text
              x={pad.l - 6}
              y={y + 3}
              fontSize={10}
              fill="var(--faint)"
              textAnchor="end"
            >
              {t}
            </text>
          </g>
        );
      })}
      {showCreated && (
        <>
          <path d={areaPath("created")} fill={`url(#${gCreated})`} />
          <path
            d={linePath("created")}
            fill="none"
            stroke="var(--pastel-sky-strong)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {showClosed && (
        <>
          <path d={areaPath("closed")} fill={`url(#${pClosed})`} />
          <path
            d={linePath("closed")}
            fill="none"
            stroke="var(--pastel-mint-strong)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {data.map((d, i) => {
        const isEdge = i === 0 || i === data.length - 1;
        // Skip a regular tick if it would crowd the always-shown last label.
        const showLabel =
          isEdge ||
          (i % labelStep === 0 && i < data.length - 1 - labelStep / 2);
        if (!showLabel) return null;
        const x = pad.l + i * xStep;
        return (
          <text
            key={d.date}
            x={x}
            y={h - 6}
            fontSize={10}
            fill="var(--faint)"
            textAnchor="middle"
          >
            {d.date.slice(5)}
          </text>
        );
      })}
      {/* Static markers, peak day pin + daily-avg dashed lines */}
      {showCreated &&
        (() => {
          const peakIdx = data.reduce(
            (pi, d, i) => (d.created > data[pi].created ? i : pi),
            0,
          );
          const avg =
            data.reduce((s, d) => s + d.created, 0) / Math.max(data.length, 1);
          const avgY = pad.t + innerH - (avg / max) * innerH;
          const p = xy(peakIdx, data[peakIdx].created);
          return (
            <g pointerEvents="none">
              <line
                x1={pad.l}
                x2={w - pad.r}
                y1={avgY}
                y2={avgY}
                stroke="var(--pastel-sky-strong)"
                strokeOpacity={0.3}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill="var(--pastel-sky-strong)"
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y - 8}
                fontSize={9}
                fill="var(--foreground)"
                textAnchor="middle"
                fontWeight={600}
              >
                peak {data[peakIdx].created}
              </text>
            </g>
          );
        })()}
      {showClosed &&
        (() => {
          const avg =
            data.reduce((s, d) => s + d.closed, 0) / Math.max(data.length, 1);
          const avgY = pad.t + innerH - (avg / max) * innerH;
          return (
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={avgY}
              y2={avgY}
              stroke="var(--pastel-mint-strong)"
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          );
        })()}
      {hoveredIdx !== null && data[hoveredIdx] && (
        <g pointerEvents="none">
          <line
            x1={pad.l + hoveredIdx * xStep}
            x2={pad.l + hoveredIdx * xStep}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke="var(--hairline-strong)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {showCreated && (
            <circle
              cx={xy(hoveredIdx, data[hoveredIdx].created).x}
              cy={xy(hoveredIdx, data[hoveredIdx].created).y}
              r={3.5}
              fill="var(--pastel-sky-strong)"
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          )}
          {showClosed && (
            <circle
              cx={xy(hoveredIdx, data[hoveredIdx].closed).x}
              cy={xy(hoveredIdx, data[hoveredIdx].closed).y}
              r={3.5}
              fill="var(--pastel-mint-strong)"
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          )}
        </g>
      )}
      {opts?.bindHover &&
        (() => {
          const bindHover = opts.bindHover;
          return data.map((d, i) => {
            const bind = bindHover(i);
            return (
              // biome-ignore lint/a11y/useSemanticElements: role="button" on an SVG <rect> hit area is the standard accessible pattern; no native button element exists inside SVG without breaking layout
              <rect
                key={`hit-${d.date}`}
                x={pad.l + i * xStep - xStep / 2}
                y={pad.t}
                width={xStep}
                height={innerH}
                fill="transparent"
                pointerEvents="all"
                tabIndex={0}
                role="button"
                aria-label={`${d.date}: ${d.created} created, ${d.closed} resolved`}
                style={{ cursor: "crosshair", outline: "none" }}
                {...bind}
              />
            );
          });
        })()}
    </svg>
  );
}

// Measures the container's real pixel box (ResizeObserver) so the SVG viewBox
// can be 1:1 with the rendered size. That removes preserveAspectRatio="none",
// which scaled X and Y unequally and distorted strokes, dot markers, and axis
// text, worst on wide layouts and long ranges.
function useElementSize(fallback: { w: number; h: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

interface TrendChartProps {
  data: TrendPoint[];
  heightClass: string;
  showCreated: boolean;
  showClosed: boolean;
  smooth: boolean;
  opts?: Parameters<typeof renderTrendChart>[7];
}

function TrendChart({
  data,
  heightClass,
  showCreated,
  showClosed,
  smooth,
  opts,
}: TrendChartProps) {
  const { ref, size } = useElementSize({ w: 720, h: 260 });
  const idPrefix = useId();
  return (
    <div ref={ref} className={cn("w-full", heightClass)}>
      {renderTrendChart(
        data,
        size.w,
        size.h,
        showCreated,
        showClosed,
        smooth,
        idPrefix,
        opts,
      )}
    </div>
  );
}

function ReportsTrendInner({ data }: ReportsTrendProps) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(data.length);
  const [showCreated, setShowCreated] = useState(true);
  const [showClosed, setShowClosed] = useState(true);
  const [smooth, setSmooth] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const tip = useHoverTip();

  // Clamp the selected window if it now exceeds the data length (e.g. range
  // switch), but preserve an explicit narrower 7d/14d choice across refreshes.
  useEffect(() => {
    setDays((d) => (d > data.length ? data.length : d));
  }, [data.length]);

  const slice = useMemo(
    () => (days >= data.length ? data : data.slice(-days)),
    [data, days],
  );

  // Tracks last pointer type (mouse vs touch). Must run unconditionally,
  // before the early return below (rules of hooks).
  const lastPtrType = useRef<string>("mouse");

  if (data.length === 0) {
    return (
      <Tile title="Reports over time" className="lg:col-span-8 lg:row-span-2">
        <EmptyState message="No reports in range" />
      </Tile>
    );
  }

  const totalCreated = data.reduce((s, d) => s + d.created, 0);
  const totalClosed = data.reduce((s, d) => s + d.closed, 0);
  const ratio = totalCreated ? (totalClosed / totalCreated) * 100 : 0;
  const dailyAvgCreated = totalCreated / Math.max(data.length, 1);
  const dailyAvgClosed = totalClosed / Math.max(data.length, 1);
  const keyPoints = buildTrendKeyPoints(data);

  const sliceCreated = slice.reduce((s, d) => s + d.created, 0);
  const sliceClosed = slice.reduce((s, d) => s + d.closed, 0);
  // `slice` can be empty when the user picks a window via the modal pills;
  // provide an initial accumulator so reduce never throws, and fall back to
  // a zero point so downstream `.date` reads are safe.
  const peakDay = slice.length
    ? slice.reduce((peak, d) => (d.created > peak.created ? d : peak))
    : { date: "", created: 0, closed: 0 };

  const tipForDay = (i: number) => {
    const d = data[i];
    const prev = i > 0 ? data[i - 1] : null;
    const dayRatio = d.created ? (d.closed / d.created) * 100 : 0;
    const deltaCreated = prev ? d.created - prev.created : 0;
    const deltaClosed = prev ? d.closed - prev.closed : 0;
    const netDelta = deltaCreated - deltaClosed;
    return {
      title: d.date,
      accent: "var(--pastel-sky-strong)",
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow
            label="Created"
            value={d.created.toLocaleString()}
            accent="var(--pastel-sky-strong)"
          />
          <TipRow
            label="Resolved"
            value={d.closed.toLocaleString()}
            accent="var(--pastel-mint-strong)"
          />
          <TipRow label="Throughput" value={`${dayRatio.toFixed(0)}%`} muted />
          {prev && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-faint text-[11px]">vs prior day</span>
              <span className="inline-flex items-center gap-1.5">
                <TipChip
                  tone={
                    deltaCreated > 0
                      ? "warn"
                      : deltaCreated < 0
                        ? "good"
                        : "neutral"
                  }
                >
                  {deltaCreated > 0 ? "+" : ""}
                  {deltaCreated} new
                </TipChip>
                <TipChip
                  tone={
                    deltaClosed > 0
                      ? "good"
                      : deltaClosed < 0
                        ? "bad"
                        : "neutral"
                  }
                >
                  {deltaClosed > 0 ? "+" : ""}
                  {deltaClosed} cls
                </TipChip>
              </span>
            </div>
          )}
        </div>
      ),
      footer: prev ? (
        <div className="flex items-center justify-between">
          <span>
            Day {i + 1} of {data.length}
          </span>
          <TipChip
            tone={netDelta < 0 ? "good" : netDelta > 0 ? "bad" : "neutral"}
          >
            {netDelta < 0 ? "Backlog ↓" : netDelta > 0 ? "Backlog ↑" : "Flat"}
          </TipChip>
        </div>
      ) : (
        <span>Day 1 of {data.length} · baseline</span>
      ),
    };
  };

  const bindDay = (i: number) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      lastPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHoveredDay(i);
      tip.show(tipForDay(i), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (lastPtrType.current === "touch") return;
      setHoveredDay(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (lastPtrType.current !== "touch") return;
      if (hoveredDay === i) {
        setHoveredDay(null);
        tip.hide();
      } else {
        setHoveredDay(i);
        tip.show(tipForDay(i), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHoveredDay(i);
      tip.show(tipForDay(i), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHoveredDay(null);
      tip.hide();
    },
  });

  const legendTip = (series: "created" | "closed") => {
    const isCreated = series === "created";
    const color = isCreated
      ? "var(--pastel-sky-strong)"
      : "var(--pastel-mint-strong)";
    const total = isCreated ? totalCreated : totalClosed;
    const avg = isCreated ? dailyAvgCreated : dailyAvgClosed;
    return {
      title: isCreated ? "Created" : "Resolved",
      accent: color,
      body: (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-faint leading-snug">
            {isCreated
              ? "New reports filed by residents on each day."
              : "Reports verified closed by ops crews on each day."}
          </p>
          <TipRow label="Total" value={total.toLocaleString()} accent={color} />
          <TipRow label="Daily avg" value={avg.toFixed(1)} muted />
          <TipRow label="Window" value={`${data.length}d`} muted />
        </div>
      ),
      footer: !isCreated ? (
        <div className="flex items-center justify-between">
          <span>Throughput</span>
          <TipChip tone={ratio >= 100 ? "good" : ratio >= 80 ? "warn" : "bad"}>
            {ratio.toFixed(0)}%
          </TipChip>
        </div>
      ) : undefined,
    };
  };

  return (
    <>
      <Tile
        title="Reports over time"
        subtitle={`${data.length}d · ${ratio.toFixed(0)}% closed`}
        className="lg:col-span-8 lg:row-span-2"
        onExpand={() => setOpen(true)}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-4 mb-2 text-[12px]">
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: intentional keyboard-a11y, focus reveals a hover tooltip via tip.bindTarget
              tabIndex={0}
              className="rounded-md px-1 -mx-1 outline-none focus-visible:bg-overlay hover:bg-overlay transition-colors cursor-default"
              {...tip.bindTarget(() => legendTip("created"))}
            >
              <Legend
                color="var(--pastel-sky-strong)"
                label={`Created · ${totalCreated}`}
              />
            </span>
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: intentional keyboard-a11y, focus reveals a hover tooltip via tip.bindTarget
              tabIndex={0}
              className="rounded-md px-1 -mx-1 outline-none focus-visible:bg-overlay hover:bg-overlay transition-colors cursor-default"
              {...tip.bindTarget(() => legendTip("closed"))}
            >
              <Legend
                color="var(--pastel-mint-strong)"
                label={`Resolved · ${totalClosed}`}
              />
            </span>
          </div>
          {/* Chart flexes to absorb the tile's slack (it spans two grid rows).
             The curve grows to fill, so the key-points strip below hugs the
             x-axis with a fixed divider gap instead of floating far beneath it. */}
          <TrendChart
            data={data}
            heightClass="flex-1 min-h-[180px] sm:min-h-[220px] lg:min-h-[260px]"
            showCreated
            showClosed
            smooth
            opts={{ hovered: hoveredDay, bindHover: bindDay }}
          />
          <TrendKeyPoints
            points={keyPoints}
            className="mt-3 border-t border-hairline pt-4"
          />
        </div>
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Reports over time"
        subtitle={`${slice.length}d window · ${sliceClosed}/${sliceCreated} closed`}
        chart={
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 text-[12px]">
              <Legend
                color="var(--pastel-sky-strong)"
                label={`Created · ${sliceCreated}`}
              />
              <Legend
                color="var(--pastel-mint-strong)"
                label={`Resolved · ${sliceClosed}`}
              />
            </div>
            <TrendChart
              data={slice}
              heightClass="h-[55vh] min-h-[380px]"
              showCreated={showCreated}
              showClosed={showClosed}
              smooth={smooth}
            />
          </div>
        }
        controls={
          <>
            <PillGroup
              label="Time range"
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: "7d" },
                { value: 14, label: "14d" },
                // Only offer "All" when it isn't already one of the fixed ranges
                // (a `data.length` of 7 or 14 would duplicate a pill).
                ...(data.length !== 7 && data.length !== 14
                  ? [{ value: data.length, label: "All" }]
                  : []),
              ]}
            />
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-subtle">Series</p>
              <Toggle
                label="Created"
                value={showCreated}
                onChange={setShowCreated}
                dotColor="var(--pastel-sky-strong)"
              />
              <Toggle
                label="Resolved"
                value={showClosed}
                onChange={setShowClosed}
                dotColor="var(--pastel-mint-strong)"
              />
            </div>
            <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
              <Toggle
                label="Smooth curves"
                value={smooth}
                onChange={setSmooth}
              />
            </div>
          </>
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Daily count of reports filed (primary) vs. closed (green). The
              ratio of closed-to-created is the operational throughput. A ratio
              above 100% means crews are eating into the backlog.
            </Prose>
            <StatGrid>
              <Stat
                label="Window"
                value={`${slice.length}d`}
                hint={
                  slice.length
                    ? `${slice[0].date.slice(5)} → ${slice[slice.length - 1].date.slice(5)}`
                    : "-"
                }
              />
              <Stat
                label="Throughput"
                value={`${sliceCreated ? ((sliceClosed / sliceCreated) * 100).toFixed(0) : 0}%`}
                hint={
                  sliceClosed >= sliceCreated
                    ? "Backlog shrinking"
                    : "Backlog growing"
                }
              />
              <Stat
                label="Peak day"
                value={peakDay.date.slice(5)}
                hint={`${peakDay.created} created`}
              />
              <Stat
                label="Daily avg"
                value={(sliceCreated / Math.max(slice.length, 1)).toFixed(1)}
                hint="reports/day created"
              />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const ReportsTrend = memo(ReportsTrendInner);

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-subtle">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------
   Key points, a compact insight strip that fills the trend tile's
   slack vertical space (it spans two grid rows but the chart is a
   fixed 260px, so ~100px sat empty below it). Three auto-derived
   takeaways: net backlog, the peak intake day, and recent filing
   momentum. Pure derivation off the same series the chart draws, so
   the numbers can never drift from the curve above them.

   This is the opinionated surface: which three signals matter, the
   momentum window, and the good/bad tone thresholds are civic-ops
   judgement calls, tune them here.
   ------------------------------------------------------------------ */

type TrendKeyPoint = {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "bad" | "neutral";
  icon: "up" | "down" | "peak";
};

function buildTrendKeyPoints(data: TrendPoint[]): TrendKeyPoint[] {
  if (data.length === 0) return [];

  const totalCreated = data.reduce((s, d) => s + d.created, 0);
  const totalClosed = data.reduce((s, d) => s + d.closed, 0);
  const netBacklog = totalCreated - totalClosed;
  const peak = data.reduce((p, d) => (d.created > p.created ? d : p), data[0]);

  // Momentum: mean daily filings in the most recent window vs the window
  // immediately before it. Window is capped at 7 days AND at half the range,
  // so the two halves never overlap on short ranges (a 7d view compares 3d↔3d).
  const win = Math.max(1, Math.min(7, Math.floor(data.length / 2)));
  const meanCreated = (xs: TrendPoint[]) =>
    xs.length ? xs.reduce((s, d) => s + d.created, 0) / xs.length : 0;
  const recentMean = meanCreated(data.slice(-win));
  const priorMean = meanCreated(data.slice(-2 * win, -win));
  const momentumPct = priorMean
    ? ((recentMean - priorMean) / priorMean) * 100
    : 0;

  return [
    {
      key: "backlog",
      label: "Net backlog",
      value: `${netBacklog > 0 ? "+" : ""}${netBacklog.toLocaleString()}`,
      hint:
        netBacklog > 0
          ? "more filed than resolved"
          : netBacklog < 0
            ? "resolved past intake"
            : "intake matched output",
      // Growing backlog is the bad direction, mirrors the backlog KPI card.
      tone: netBacklog > 0 ? "bad" : netBacklog < 0 ? "good" : "neutral",
      icon: netBacklog > 0 ? "up" : "down",
    },
    {
      key: "peak",
      label: "Peak day",
      value: peak.date.slice(5),
      hint: `${peak.created.toLocaleString()} filed`,
      tone: "neutral",
      icon: "peak",
    },
    {
      key: "momentum",
      label: `Momentum · ${win}d`,
      value: `${momentumPct >= 0 ? "+" : ""}${momentumPct.toFixed(0)}%`,
      hint:
        momentumPct >= 0
          ? "filings rising vs prior"
          : "filings easing vs prior",
      tone: "neutral",
      icon: momentumPct >= 0 ? "up" : "down",
    },
  ];
}

const KEY_POINT_TONE: Record<TrendKeyPoint["tone"], string> = {
  good: "text-[var(--status-success-fg)]",
  bad: "text-[var(--status-danger-fg)]",
  neutral: "text-faint",
};

function keyPointIcon(icon: TrendKeyPoint["icon"]) {
  const cls = "h-3.5 w-3.5";
  if (icon === "peak") return <Flame className={cls} strokeWidth={2} />;
  return icon === "up" ? (
    <TrendingUp className={cls} strokeWidth={2} />
  ) : (
    <TrendingDown className={cls} strokeWidth={2} />
  );
}

function TrendKeyPoints({
  points,
  className,
}: {
  points: TrendKeyPoint[];
  className?: string;
}) {
  if (points.length === 0) return null;
  return (
    <dl className={cn("grid grid-cols-3 gap-3", className)}>
      {points.map((p) => (
        <div key={p.key} className="flex flex-col gap-1.5">
          <dt className="text-[10px] font-medium uppercase tracking-[0.07em] text-faint leading-none">
            {p.label}
          </dt>
          <dd className="flex items-center gap-1 text-[15px] font-semibold tabular-nums leading-none text-foreground">
            <span className={KEY_POINT_TONE[p.tone]}>
              {keyPointIcon(p.icon)}
            </span>
            {p.value}
          </dd>
          <p className="text-[11px] text-faint leading-snug">{p.hint}</p>
        </div>
      ))}
    </dl>
  );
}

/* ==================================================================
   3. Severity donut
   ================================================================== */

interface SeverityDonutProps {
  data: SeveritySlice[];
}

// Severity ramp, the app-wide semantic one (@/lib/severity-colors), shared
// with the work-order grid, work-order detail, the field view and the report
// drawer. The donut deliberately does NOT use the decorative pastel ramp the
// rest of this dashboard uses for its categorical series: severity encodes
// STATE, not category, so it needs a monotonic low→high green→red ramp you can
// read at a glance without the legend. Arcs, legend dots and tooltip accents
// all read this one map.
const SEVERITY_COLORS = SEVERITY_HUE;

const SEVERITY_DESC: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Cosmetic, graffiti, faded paint, no safety risk",
  2: "Minor, small potholes, isolated streetlight, low traffic impact",
  3: "Moderate, sidewalk hazard, drainage issue, partial obstruction",
  4: "Major, downed sign, large pothole on arterial, water leak",
  5: "Emergency. Fallen tree blocking road, gushing main, live wire",
};

function renderDonut(
  data: SeveritySlice[],
  size: number,
  opts?: {
    hovered?: SeveritySlice["severity"] | null;
    onHover?: (
      sev: SeveritySlice["severity"] | null,
      e?: React.PointerEvent,
    ) => void;
    bindHover?: (sev: SeveritySlice) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const stroke = size * 0.1;
  const r = size / 2 - stroke / 2 - 4;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const hovered = opts?.hovered ?? null;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 overflow-visible"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Severity distribution donut chart"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--hairline)"
        strokeWidth={stroke}
      />
      {data.map((s) => {
        const frac = s.count / total;
        const dash = frac * c;
        const isHovered = hovered === s.severity;
        const isDim = hovered !== null && !isHovered;
        const bind = opts?.bindHover?.(s);
        const el = (
          <circle
            key={s.severity}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={isHovered ? stroke * 1.18 : stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            tabIndex={bind ? 0 : -1}
            role={bind ? "button" : undefined}
            aria-label={
              bind
                ? `Severity ${s.severity}, ${s.count} reports, ${(frac * 100) | 0}%`
                : undefined
            }
            style={{
              // Via `style`, not the `stroke` presentation attribute:
              // `color-mix()` (levels 2 and 4) is not reliably parsed there.
              stroke: SEVERITY_COLORS[s.severity],
              opacity: isDim ? 0.32 : 1,
              transition: "stroke-width 160ms ease-out, opacity 160ms ease-out",
              cursor: bind ? "pointer" : undefined,
              outline: "none",
            }}
            {...(bind ?? {})}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function SeverityDonutInner({ data }: SeverityDonutProps) {
  const [open, setOpen] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const [hovered, setHovered] = useState<SeveritySlice["severity"] | null>(
    null,
  );
  const tip = useHoverTip();
  const hasData = data.some((d) => d.count > 0);
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const dominant = [...data].sort((a, b) => b.count - a.count)[0];
  const emergencyShare =
    ((data.find((d) => d.severity === 5)?.count ?? 0) / total) * 100;
  const ranked = [...data].sort((a, b) => b.count - a.count);
  const sliceRank = (sev: SeveritySlice["severity"]) =>
    ranked.findIndex((s) => s.severity === sev) + 1;

  const tipFor = (s: SeveritySlice) => {
    const pct = (s.count / total) * 100;
    const rank = sliceRank(s.severity);
    const color = SEVERITY_COLORS[s.severity];
    return {
      title: `Severity ${s.severity}`,
      accent: color,
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Reports" value={s.count.toLocaleString()} />
          <TipRow label="Share" value={`${pct.toFixed(1)}%`} />
          <TipBar pct={pct} color={color} />
          <p className="text-[11px] text-faint leading-snug mt-1">
            {SEVERITY_DESC[s.severity]}
          </p>
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>
            Rank #{rank} of {data.length}
          </span>
          <TipChip
            tone={
              s.severity >= 4 ? "bad" : s.severity === 3 ? "warn" : "neutral"
            }
          >
            {s.severity >= 4
              ? "Pages on-call"
              : s.severity === 3
                ? "Same-week"
                : "Batched"}
          </TipChip>
        </div>
      ),
    };
  };

  const slicePtrType = useRef<string>("mouse");
  const bindSlice = (s: SeveritySlice) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      slicePtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHovered(s.severity);
      tip.show(tipFor(s), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (slicePtrType.current === "touch") return;
      setHovered(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (slicePtrType.current !== "touch") return;
      if (hovered === s.severity) {
        setHovered(null);
        tip.hide();
      } else {
        setHovered(s.severity);
        tip.show(tipFor(s), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHovered(s.severity);
      tip.show(tipFor(s), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHovered(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Severity mix"
        subtitle={`${total} reports`}
        className="lg:col-span-4"
        onExpand={hasData ? () => setOpen(true) : undefined}
      >
        {!hasData ? (
          <EmptyState message="No classified reports in range" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-5">
            <div className="flex-shrink-0">
              {renderDonut(data, 150, {
                hovered,
                bindHover: bindSlice,
              })}
            </div>
            {/* Legend sits below the donut as 5 equal columns. A side-by-side
             legend clips at this col-span-4 width once the viewport hits the
             lg breakpoint; stacking is width-robust and uses the tile's slack
             vertical space. */}
            <ul className="grid w-full grid-cols-5 gap-1 text-[12px]">
              {data.map((s) => {
                const pct = (s.count / total) * 100;
                const isActive = hovered === s.severity;
                return (
                  <li
                    key={s.severity}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 justify-center transition-colors cursor-default",
                      isActive
                        ? "bg-overlay"
                        : hovered !== null
                          ? "opacity-50"
                          : "",
                    )}
                    {...bindSlice(s)}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full transition-transform",
                        isActive && "scale-150",
                      )}
                      style={{ background: SEVERITY_COLORS[s.severity] }}
                    />
                    <span className="text-subtle">Sev {s.severity}</span>
                    <span className="tabular-nums text-faint">
                      {pct.toFixed(0)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Severity mix"
        subtitle={`${total} classified reports`}
        chart={
          <div className="flex flex-col lg:flex-row items-center justify-center gap-10 py-4">
            {renderDonut(data, 320)}
            <ul className="flex-1 max-w-md space-y-3 w-full">
              {data.map((s) => {
                const pct = (s.count / total) * 100;
                return (
                  <li
                    key={s.severity}
                    className="flex items-start gap-3 p-3 rounded-lg bg-overlay"
                  >
                    <span
                      className="mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ background: SEVERITY_COLORS[s.severity] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[14px] font-medium text-foreground">
                          Severity {s.severity}
                        </span>
                        <span className="text-[13px] tabular-nums text-subtle">
                          {showCounts
                            ? s.count.toLocaleString()
                            : `${pct.toFixed(1)}%`}
                        </span>
                      </div>
                      <p className="text-[12px] text-faint mt-0.5">
                        {SEVERITY_DESC[s.severity]}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        }
        controls={
          <Toggle
            label="Show raw counts"
            value={showCounts}
            onChange={setShowCounts}
          />
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Severity is assigned by the AI classifier at report ingest (0-5
              scale). Sev 5 incidents page on-call dispatch immediately; sev 4
              routes to next-business-day; sev 1-3 batches into weekly crew
              runs.
            </Prose>
            <StatGrid>
              <Stat label="Total" value={total.toLocaleString()} />
              <Stat
                label="Dominant tier"
                value={`Sev ${dominant.severity}`}
                hint={`${dominant.count} reports`}
              />
              <Stat
                label="Emergency share"
                value={`${emergencyShare.toFixed(1)}%`}
                hint="Sev 5, paged on-call"
              />
              <Stat
                label="Critical+"
                value={`${((((data.find((d) => d.severity === 4)?.count ?? 0) + (data.find((d) => d.severity === 5)?.count ?? 0)) / total) * 100).toFixed(0)}%`}
                hint="Sev 4-5"
              />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const SeverityDonut = memo(SeverityDonutInner);

/* ==================================================================
   4. Status funnel
   ================================================================== */

interface StatusFunnelProps {
  data: StatusFunnelStep[];
}

// Pastel stage ramp for the funnel (dashboard-only; chips elsewhere keep
// lib/status.ts's STATUS_TONE): open=butter, dispatched/in_progress share
// sky (their label is what distinguishes them, not color), closed=mint.
// Soft tints fill the bars; the -strong twins carry edges and tooltips.
const STATUS_COLOR: Record<string, string> = {
  open: "var(--pastel-butter)",
  dispatched: "var(--pastel-sky)",
  in_progress: "var(--pastel-sky)",
  closed: "var(--pastel-mint)",
};

const STATUS_COLOR_STRONG: Record<string, string> = {
  open: "var(--pastel-butter-strong)",
  dispatched: "var(--pastel-sky-strong)",
  in_progress: "var(--pastel-sky-strong)",
  closed: "var(--pastel-mint-strong)",
};

function renderFunnelBars(
  data: StatusFunnelStep[],
  showConversion: boolean,
  opts?: {
    hovered?: string | null;
    bindHover?: (step: StatusFunnelStep) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  const max = Math.max(...data.map((s) => s.count), 1);
  const hovered = opts?.hovered ?? null;
  return (
    <ul className="space-y-3">
      {data.map((step, i) => {
        const pct = (step.count / max) * 100;
        const color = STATUS_COLOR[step.status] ?? "var(--faint)";
        const edge = STATUS_COLOR_STRONG[step.status] ?? "var(--subtle)";
        const prev = i > 0 ? data[i - 1].count : null;
        const conv = prev ? Math.round((step.count / prev) * 100) : null;
        const bind = opts?.bindHover?.(step);
        const isActive = hovered === step.status;
        const isDim = hovered !== null && !isActive;
        return (
          <li
            key={step.status}
            tabIndex={bind ? 0 : -1}
            className={cn(
              "rounded-md px-1.5 py-1 -mx-1.5 transition-all duration-150 outline-none",
              bind &&
                "cursor-default focus-visible:ring-1 focus-visible:ring-hairline-strong",
              isActive && "bg-overlay",
              isDim && "opacity-45",
            )}
            {...(bind ?? {})}
          >
            <div className="flex items-center justify-between text-[13px]">
              <span
                className={cn(
                  "transition-colors",
                  isActive ? "text-foreground" : "text-subtle",
                )}
              >
                {step.label}
              </span>
              <span className="tabular-nums text-faint inline-flex items-center gap-2">
                {showConversion && conv !== null && (
                  <span className="text-[11px] text-faint">{conv}%</span>
                )}
                {step.count}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-overlay">
              {/* biome-ignore lint/a11y/useSemanticElements: role="meter" is correct; native <meter> renders its own non-stylable widget UI and would destroy this custom progress-bar layout */}
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: color,
                  boxShadow: `inset 0 0 0 1px ${edge}`,
                  opacity: isActive ? 1 : isDim ? 0.55 : 0.85,
                }}
                role="meter"
                aria-valuenow={step.count}
                aria-valuemin={0}
                aria-valuemax={max}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_INTERPRETATION: Record<
  string,
  { label: string; tone: "neutral" | "good" | "bad" | "warn" }
> = {
  open: { label: "Dispatch backlog", tone: "warn" },
  dispatched: { label: "Routed to crew", tone: "neutral" },
  in_progress: { label: "Crews active", tone: "neutral" },
  closed: { label: "Verified fixed", tone: "good" },
};

function StatusFunnelInner({ data }: StatusFunnelProps) {
  const [open, setOpen] = useState(false);
  const [showConversion, setShowConversion] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const tip = useHoverTip();
  const total = data.reduce((s, d) => s + d.count, 0);
  const totalSafe = total || 1;
  const closed = data.find((d) => d.status === "closed")?.count ?? 0;
  const stuck = data
    .filter((d) => d.status !== "closed")
    .reduce((s, d) => s + d.count, 0);

  const tipFor = (step: StatusFunnelStep) => {
    const idx = data.findIndex((d) => d.status === step.status);
    const prev = idx > 0 ? data[idx - 1] : null;
    const conv =
      prev && prev.count > 0
        ? Math.round((step.count / prev.count) * 100)
        : null;
    const pct = (step.count / totalSafe) * 100;
    const color = STATUS_COLOR_STRONG[step.status] ?? "var(--faint)";
    const interp = STATUS_INTERPRETATION[step.status] ?? {
      label: "Stage",
      tone: "neutral" as const,
    };
    return {
      title: step.label,
      accent: color,
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Count" value={step.count.toLocaleString()} />
          <TipRow label="Share of total" value={`${pct.toFixed(1)}%`} />
          <TipBar pct={pct} color={color} />
          {conv !== null && prev && (
            <TipRow label={`From ${prev.label}`} value={`${conv}%`} muted />
          )}
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>
            Stage {idx + 1} of {data.length}
          </span>
          <TipChip tone={interp.tone}>{interp.label}</TipChip>
        </div>
      ),
    };
  };

  const stepPtrType = useRef<string>("mouse");
  const bindStep = (step: StatusFunnelStep) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      stepPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHovered(step.status);
      tip.show(tipFor(step), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (stepPtrType.current === "touch") return;
      setHovered(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (stepPtrType.current !== "touch") return;
      if (hovered === step.status) {
        setHovered(null);
        tip.hide();
      } else {
        setHovered(step.status);
        tip.show(tipFor(step), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHovered(step.status);
      tip.show(tipFor(step), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHovered(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Workflow pipeline"
        className="lg:col-span-4"
        onExpand={total > 0 ? () => setOpen(true) : undefined}
      >
        {total > 0 ? (
          renderFunnelBars(data, false, { hovered, bindHover: bindStep })
        ) : (
          <EmptyState message="No reports in range" />
        )}
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Workflow pipeline"
        subtitle={`${total} reports across all stages`}
        chart={
          <div className="py-4">
            <div className="text-[14px]">
              {renderFunnelBars(data, showConversion, {
                hovered,
                bindHover: bindStep,
              })}
            </div>
          </div>
        }
        controls={
          <Toggle
            label="Show stage-to-stage retention"
            value={showConversion}
            onChange={setShowConversion}
          />
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Reports flow through four stages: residents file (Open) → dispatch
              routes to a crew (Dispatched) → crew working (In progress) →
              verified fixed (Resolved). Drop-off between stages reveals where
              the system is bottlenecked.
            </Prose>
            <StatGrid>
              <Stat
                label="In flight"
                value={stuck.toLocaleString()}
                hint="Not yet resolved"
              />
              <Stat label="Resolved" value={closed.toLocaleString()} />
              <Stat
                label="Resolution rate"
                value={`${total ? ((closed / total) * 100).toFixed(0) : 0}%`}
              />
              <Stat
                label="Dispatch backlog"
                value={(
                  data.find((d) => d.status === "open")?.count ?? 0
                ).toString()}
                hint="Awaiting routing"
              />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const StatusFunnel = memo(StatusFunnelInner);

/* ==================================================================
   5. Resolution time histogram
   ================================================================== */

interface ResolutionHistogramProps {
  data: ResolutionBucket[];
}

function renderHistogram(
  data: ResolutionBucket[],
  heightClass: string,
  showCumulative: boolean,
  opts?: {
    hovered?: number | null;
    bindHover?: (i: number) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const max = Math.max(...data.map((d) => d.count), 1);
  const cumulative: number[] = [];
  data.reduce((acc, d, i) => {
    const next = acc + d.count;
    cumulative[i] = (next / total) * 100;
    return next;
  }, 0);
  const hoveredIdx = opts?.hovered ?? null;
  // SLA bucket = first bucket whose hours_max >= 72
  const slaIdx = data.findIndex((b) => b.hours_max >= 72);
  // Median bucket = first bucket where cumulative crosses 50%
  let medianIdx = 0;
  let acc = 0;
  for (let i = 0; i < data.length; i++) {
    acc += data[i].count;
    if (acc >= total / 2) {
      medianIdx = i;
      break;
    }
  }

  return (
    <div className={cn("flex items-end gap-2 relative", heightClass)}>
      {data.map((b, i) => {
        const h = (b.count / max) * 100;
        const cum = cumulative[i].toFixed(0);
        const isHovered = hoveredIdx === i;
        const isDim = hoveredIdx !== null && !isHovered;
        const isSla = slaIdx === i;
        const isMedian = medianIdx === i;
        const bind = opts?.bindHover?.(i);
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is gated by the same `bind` condition as role="button" (which supports aria-label); when not interactive both are undefined
          <div
            key={b.label}
            tabIndex={bind ? 0 : -1}
            role={bind ? "button" : undefined}
            aria-label={
              bind
                ? `${b.label}: ${b.count} reports, cumulative ${cum}%`
                : undefined
            }
            className={cn(
              "group relative flex flex-1 flex-col items-center gap-2 h-full justify-end rounded-md outline-none transition-opacity duration-150",
              bind && "cursor-pointer focus-visible:bg-overlay",
              isDim && "opacity-40",
            )}
            style={{ outline: "none" }}
            {...(bind ?? {})}
          >
            {isMedian && (
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider text-subtle px-1.5 py-0.5 rounded bg-overlay-strong z-10">
                median
              </span>
            )}
            <span
              className={cn(
                "text-[11px] tabular-nums transition-colors",
                isHovered
                  ? "text-foreground"
                  : "text-faint group-hover:text-subtle",
              )}
            >
              {b.count}
            </span>
            {/* biome-ignore lint/a11y/useSemanticElements: role="meter" is correct; native <meter> renders its own non-stylable widget and would destroy this bar layout */}
            <div
              data-bento-bar
              className={cn(
                "w-full rounded-md transition-colors duration-300",
                isHovered || isMedian
                  ? "bg-pastel-lavender-strong"
                  : "bg-pastel-lavender",
              )}
              style={
                {
                  height: `${h}%`,
                  minHeight: 4,
                  "--bar-idx": i,
                  boxShadow: isSla
                    ? "inset 0 0 0 1.5px color-mix(in srgb, var(--color-success) 65%, transparent)"
                    : undefined,
                } as React.CSSProperties
              }
              role="meter"
              aria-valuenow={b.count}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-label={
                bind
                  ? undefined
                  : `${b.label}: ${b.count} reports, cumulative ${cum}%`
              }
            />
            <div className="text-center">
              <p
                className={cn(
                  "inline-flex items-center gap-0.5 text-[12px] tabular-nums transition-colors",
                  isSla
                    ? "text-[var(--status-success-fg)]"
                    : isHovered
                      ? "text-foreground"
                      : "text-subtle",
                )}
              >
                {b.label}
                {isSla && (
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                )}
              </p>
              {showCumulative && (
                <p className="text-[10px] text-faint tabular-nums">{cum}%</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResolutionHistogramInner({ data }: ResolutionHistogramProps) {
  const [open, setOpen] = useState(false);
  const [showCumulative, setShowCumulative] = useState(true);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const tip = useHoverTip();

  const total = data.reduce((s, d) => s + d.count, 0);
  const totalSafe = total || 1;
  const within24h = data[0]?.count ?? 0;
  const within72h = (data[0]?.count ?? 0) + (data[1]?.count ?? 0);
  const overWeek = (data[3]?.count ?? 0) + (data[4]?.count ?? 0);

  // Approx median bucket
  let acc = 0;
  let medianLabel = data[0]?.label ?? "-";
  for (const b of data) {
    acc += b.count;
    if (acc >= total / 2) {
      medianLabel = b.label;
      break;
    }
  }

  const cumulativePct: number[] = [];
  data.reduce((a, d, i) => {
    const next = a + d.count;
    cumulativePct[i] = (next / totalSafe) * 100;
    return next;
  }, 0);

  const bucketMeaning = (
    b: ResolutionBucket,
  ): {
    text: string;
    tone: "good" | "warn" | "bad" | "neutral";
    chip: string;
  } => {
    if (b.hours_max <= 72) {
      return { text: "Within standard 72h SLA", tone: "good", chip: "On-SLA" };
    }
    if (b.hours_max <= 168) {
      return { text: "Same-week resolution", tone: "warn", chip: "Slow" };
    }
    return {
      text: "Over a week, escalation candidates",
      tone: "bad",
      chip: "Escalate",
    };
  };

  const tipForBar = (i: number) => {
    const b = data[i];
    const pct = (b.count / totalSafe) * 100;
    const cum = cumulativePct[i];
    const meaning = bucketMeaning(b);
    return {
      title: `${b.label} resolution`,
      accent: "var(--pastel-lavender-strong)",
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Reports" value={b.count.toLocaleString()} />
          <TipRow label="Share" value={`${pct.toFixed(1)}%`} />
          <TipBar pct={pct} color="var(--pastel-lavender-strong)" />
          <TipRow label="Cumulative" value={`${cum.toFixed(0)}%`} muted />
          <p className="text-[11px] text-faint leading-snug mt-1">
            {meaning.text}
          </p>
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>
            Bucket {i + 1} of {data.length}
          </span>
          <TipChip tone={meaning.tone}>{meaning.chip}</TipChip>
        </div>
      ),
    };
  };

  const barPtrType = useRef<string>("mouse");
  const bindBar = (i: number) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      barPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHoveredBar(i);
      tip.show(tipForBar(i), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (barPtrType.current === "touch") return;
      setHoveredBar(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (barPtrType.current !== "touch") return;
      if (hoveredBar === i) {
        setHoveredBar(null);
        tip.hide();
      } else {
        setHoveredBar(i);
        tip.show(tipForBar(i), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHoveredBar(i);
      tip.show(tipForBar(i), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHoveredBar(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Resolution time"
        subtitle={total > 0 ? `Median ~${medianLabel}` : undefined}
        className="lg:col-span-8"
        onExpand={total > 0 ? () => setOpen(true) : undefined}
      >
        {total > 0 ? (
          renderHistogram(data, "h-[180px]", true, {
            hovered: hoveredBar,
            bindHover: bindBar,
          })
        ) : (
          <EmptyState message="No resolved reports in range" />
        )}
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Resolution time distribution"
        subtitle={`${total} resolved reports`}
        chart={
          <div className="py-6">
            {renderHistogram(data, "h-[55vh] min-h-[360px]", showCumulative)}
          </div>
        }
        controls={
          <Toggle
            label="Show cumulative %"
            value={showCumulative}
            onChange={setShowCumulative}
          />
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Time from report submission to verified closure, bucketed. The
              shape of this distribution is the single best signal of
              operational health. A left-skewed (fast) curve means crews are
              turning around tickets quickly.
            </Prose>
            <StatGrid>
              <Stat
                label="Within 24h"
                value={`${total ? ((within24h / total) * 100).toFixed(0) : 0}%`}
                hint={`${within24h} reports`}
              />
              <Stat
                label="Within 72h"
                value={`${total ? ((within72h / total) * 100).toFixed(0) : 0}%`}
                hint="Standard SLA"
              />
              <Stat label="Median bucket" value={medianLabel} />
              <Stat
                label="Over 1 week"
                value={`${total ? ((overWeek / total) * 100).toFixed(0) : 0}%`}
                hint={`${overWeek} stuck`}
              />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const ResolutionHistogram = memo(ResolutionHistogramInner);

/* ==================================================================
   6. Peak hours heatmap
   ================================================================== */

interface PeakHoursHeatmapProps {
  data: HeatCell[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface HeatmapHoverHandlers {
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerLeave: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: () => void;
}

interface RenderHeatmapOpts {
  hoveredCell?: { day: number; hour: number } | null;
  hoveredDay?: number | null;
  hoveredLegend?: number | null;
  bindCell?: (cell: HeatCell) => HeatmapHoverHandlers;
  bindDay?: (day: number) => HeatmapHoverHandlers;
  bindLegend?: (idx: number) => HeatmapHoverHandlers;
}

function renderHeatmap(
  data: HeatCell[],
  cellHeight: number,
  weekdayOnly: boolean,
  intense: boolean,
  opts?: RenderHeatmapOpts,
) {
  const filtered = weekdayOnly
    ? data.filter((c) => c.day >= 1 && c.day <= 5)
    : data;
  const max = Math.max(...filtered.map((c) => c.count), 1);
  const days = weekdayOnly ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
  const grid: Record<number, HeatCell[]> = {};
  for (const d of days) grid[d] = [];
  for (const c of filtered) grid[c.day]?.push(c);

  const labelW = 32;
  const baseAlpha = intense ? 0.06 : 0.08;
  const peakAlpha = intense ? 0.95 : 0.82;

  const hoveredCell = opts?.hoveredCell ?? null;
  const hoveredDay = opts?.hoveredDay ?? null;
  const hasHover = hoveredCell !== null || hoveredDay !== null;
  // Static peak marker
  const peakCell = filtered.reduce(
    (p, c) => (c.count > p.count ? c : p),
    filtered[0] ?? { day: 0, hour: 0, count: 0 },
  );

  return (
    <div className="flex gap-2 w-full">
      <div className="flex flex-col gap-[3px] pt-5" style={{ width: labelW }}>
        {days.map((d) => {
          const dayBind = opts?.bindDay?.(d);
          const isDayActive =
            hoveredDay === d || (hoveredCell !== null && hoveredCell.day === d);
          const isDayDim = hasHover && !isDayActive;
          return (
            // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is gated by the same `dayBind` condition as role="button" (which supports aria-label); without it both are undefined
            <span
              key={d}
              className={cn(
                "text-[10px] leading-none text-right pr-1 rounded outline-none cursor-default",
                isDayActive
                  ? "text-foreground font-medium"
                  : isDayDim
                    ? "text-faint"
                    : "text-faint",
                dayBind &&
                  "focus-visible:ring-1 focus-visible:ring-hairline-strong",
              )}
              style={{
                height: cellHeight,
                lineHeight: `${cellHeight}px`,
                transition: "color 140ms ease-out",
              }}
              tabIndex={dayBind ? 0 : -1}
              role={dayBind ? "button" : undefined}
              aria-label={
                dayBind ? `${DAY_LABELS[d]}: show daily summary` : undefined
              }
              {...(dayBind ?? {})}
            >
              {DAY_LABELS[d]}
            </span>
          );
        })}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between mb-1 text-[10px] text-faint tabular-nums">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
        <div className="space-y-[3px]">
          {days.map((d) => (
            <div key={d} className="flex gap-[3px]">
              {grid[d].map((cell) => {
                const intensity = cell.count / max;
                const cellBind = opts?.bindCell?.(cell);
                const isCellActive =
                  hoveredCell?.day === cell.day &&
                  hoveredCell?.hour === cell.hour;
                const isDayMatch =
                  hoveredDay === cell.day ||
                  (hoveredCell !== null && hoveredCell.day === cell.day);
                const isDim = hasHover && !isCellActive && !isDayMatch;
                const isPeak =
                  cell.day === peakCell.day && cell.hour === peakCell.hour;
                return (
                  <div
                    key={`${cell.day}-${cell.hour}`}
                    className={cn(
                      "flex-1 rounded-[3px] outline-none",
                      cellBind && "cursor-default",
                    )}
                    style={{
                      height: cellHeight,
                      background: `color-mix(in srgb, var(--pastel-mint-strong) ${Math.round((baseAlpha + intensity * (peakAlpha - baseAlpha)) * 100)}%, transparent)`,
                      opacity: isDim ? 0.4 : 1,
                      transform: isCellActive ? "scale(1.18)" : "scale(1)",
                      transformOrigin: "center",
                      boxShadow: isCellActive
                        ? "0 0 0 1.5px var(--surface), 0 2px 10px color-mix(in srgb, var(--pastel-mint-strong) 30%, transparent)"
                        : isPeak
                          ? "inset 0 0 0 1.5px var(--surface)"
                          : "none",
                      zIndex: isCellActive ? 5 : "auto",
                      position: "relative",
                      transition:
                        "opacity 140ms ease-out, transform 160ms ease-out, box-shadow 160ms ease-out",
                    }}
                    aria-label={`${DAY_LABELS[cell.day]} ${String(cell.hour).padStart(2, "0")}:00, ${cell.count} reports`}
                    role="img"
                    {...(cellBind ?? {})}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-faint">
          <span>Less</span>
          <div className="flex gap-[2px]">
            {[0.08, 0.25, 0.45, 0.65, 0.9].map((o, idx) => {
              const legendBind = opts?.bindLegend?.(idx);
              const isLegendActive = opts?.hoveredLegend === idx;
              return (
                // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is gated by the same `legendBind` condition as role="img" (which supports aria-label); without it both are undefined
                <div
                  key={o}
                  className={cn(
                    "h-[10px] w-[10px] rounded-[2px] outline-none",
                    legendBind &&
                      "cursor-default focus-visible:ring-1 focus-visible:ring-hairline-strong",
                  )}
                  style={{
                    background: `color-mix(in srgb, var(--pastel-mint-strong) ${o * 100}%, transparent)`,
                    transform: isLegendActive ? "scale(1.35)" : "scale(1)",
                    boxShadow: isLegendActive
                      ? "0 0 0 1px var(--surface)"
                      : "none",
                    transition:
                      "transform 140ms ease-out, box-shadow 140ms ease-out",
                  }}
                  tabIndex={legendBind ? 0 : -1}
                  role={legendBind ? "img" : undefined}
                  aria-label={
                    legendBind ? `Intensity bucket ${idx + 1} of 5` : undefined
                  }
                  {...(legendBind ?? {})}
                />
              );
            })}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
function PeakHoursHeatmapInner({ data }: PeakHoursHeatmapProps) {
  const [open, setOpen] = useState(false);
  const [weekdayOnly, setWeekdayOnly] = useState(false);
  const [intense, setIntense] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{
    day: number;
    hour: number;
  } | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [hoveredLegend, setHoveredLegend] = useState<number | null>(null);
  const tip = useHoverTip();

  // Initial accumulator: reduce with no seed throws on an empty array.
  const peak = data.reduce((p, c) => (c.count > p.count ? c : p), {
    day: 0,
    hour: 0,
    count: 0,
  } as HeatCell);
  const totalReports = data.reduce((s, c) => s + c.count, 0);
  const avgPerCell = totalReports / Math.max(data.length, 1);
  const hasData = totalReports > 0;

  // 168-cell ranking by count desc for "intensity rank" tooltip stat
  const cellRankMap = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.count - a.count);
    const m = new Map<string, number>();
    sorted.forEach((c, i) => {
      m.set(`${c.day}-${c.hour}`, i + 1);
    });
    return m;
  }, [data]);

  // Per-day aggregates for day-label hover summary
  const dayAggregates = useMemo(() => {
    const totals: Record<number, number> = {};
    const peakHour: Record<number, { hour: number; count: number }> = {};
    for (const cell of data) {
      totals[cell.day] = (totals[cell.day] ?? 0) + cell.count;
      const cur = peakHour[cell.day];
      if (!cur || cell.count > cur.count) {
        peakHour[cell.day] = { hour: cell.hour, count: cell.count };
      }
    }
    return { totals, peakHour };
  }, [data]);

  const max168 = Math.max(...data.map((c) => c.count), 1);

  const tipForCell = (cell: HeatCell) => {
    const pct = (cell.count / (totalReports || 1)) * 100;
    const rank = cellRankMap.get(`${cell.day}-${cell.hour}`) ?? 0;
    const isWeekday = cell.day >= 1 && cell.day <= 5;
    const isCommute =
      isWeekday &&
      ((cell.hour >= 7 && cell.hour <= 9) ||
        (cell.hour >= 16 && cell.hour <= 19));
    const intensityPct = (cell.count / max168) * 100;
    return {
      title: `${DAY_LABELS[cell.day]} ${String(cell.hour).padStart(2, "0")}:00`,
      accent: "var(--pastel-mint-strong)",
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Reports" value={cell.count.toLocaleString()} />
          <TipRow label="% of week" value={`${pct.toFixed(2)}%`} />
          <TipBar pct={intensityPct} color="var(--pastel-mint-strong)" />
          <TipRow
            label="Intensity"
            value={`${intensityPct.toFixed(0)}% of peak`}
            muted
          />
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>
            Rank #{rank} of {data.length} slots
          </span>
          <TipChip tone={isCommute ? "warn" : "neutral"}>
            {isCommute ? "Peak commute" : "Off-hours"}
          </TipChip>
        </div>
      ),
    };
  };

  const tipForDay = (day: number) => {
    const dayTotal = dayAggregates.totals[day] ?? 0;
    const peakForDay = dayAggregates.peakHour[day];
    const weekShare = (dayTotal / (totalReports || 1)) * 100;
    const isWeekend = day === 0 || day === 6;
    return {
      title: `${DAY_LABELS[day]}, daily summary`,
      accent: "var(--pastel-mint-strong)",
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Reports" value={dayTotal.toLocaleString()} />
          <TipRow label="Share of week" value={`${weekShare.toFixed(1)}%`} />
          <TipBar pct={weekShare} color="var(--pastel-mint-strong)" />
          {peakForDay && (
            <TipRow
              label="Peak hour"
              value={`${String(peakForDay.hour).padStart(2, "0")}:00 · ${peakForDay.count}`}
              muted
            />
          )}
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>All {dayAggregates.peakHour[day] ? 24 : 0} hour slots</span>
          <TipChip tone={isWeekend ? "neutral" : "warn"}>
            {isWeekend ? "Weekend" : "Weekday"}
          </TipChip>
        </div>
      ),
    };
  };

  const tipForLegend = (idx: number) => {
    const opacities = [0.08, 0.25, 0.45, 0.65, 0.9];
    const o = opacities[idx];
    const baseAlphaRef = 0.08;
    const peakAlphaRef = 0.82;
    const intensityFrac = (o - baseAlphaRef) / (peakAlphaRef - baseAlphaRef);
    const lowPct = Math.max(0, intensityFrac * 100 - 12);
    const highPct = Math.min(100, intensityFrac * 100 + 12);
    return {
      title: `Intensity bucket ${idx + 1} of 5`,
      accent: `color-mix(in srgb, var(--pastel-mint-strong) ${o * 100}%, transparent)`,
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow
            label="Approx range"
            value={`${lowPct.toFixed(0)}%, ${highPct.toFixed(0)}% of peak`}
          />
          <TipBar pct={intensityFrac * 100} color="var(--pastel-mint-strong)" />
          <p className="text-[11px] text-faint leading-snug mt-1">
            Each cell's color maps its report count to a fraction of the single
            peak slot ({peak.count} reports).
          </p>
        </div>
      ),
    };
  };

  const heatPtrType = useRef<string>("mouse");
  const bindCell = (cell: HeatCell): HeatmapHoverHandlers => ({
    onPointerEnter: (e) => {
      heatPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHoveredCell({ day: cell.day, hour: cell.hour });
      setHoveredDay(null);
      tip.show(tipForCell(cell), e);
    },
    onPointerMove: (e) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (heatPtrType.current === "touch") return;
      setHoveredCell(null);
      tip.hide();
    },
    onClick: (e) => {
      if (heatPtrType.current !== "touch") return;
      const isActive =
        hoveredCell?.day === cell.day && hoveredCell?.hour === cell.hour;
      if (isActive) {
        setHoveredCell(null);
        tip.hide();
      } else {
        setHoveredCell({ day: cell.day, hour: cell.hour });
        setHoveredDay(null);
        tip.show(tipForCell(cell), e);
      }
    },
    onFocus: (e) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHoveredCell({ day: cell.day, hour: cell.hour });
      setHoveredDay(null);
      tip.show(tipForCell(cell), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHoveredCell(null);
      tip.hide();
    },
  });

  const bindDay = (day: number): HeatmapHoverHandlers => ({
    onPointerEnter: (e) => {
      heatPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHoveredDay(day);
      setHoveredCell(null);
      tip.show(tipForDay(day), e);
    },
    onPointerMove: (e) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (heatPtrType.current === "touch") return;
      setHoveredDay(null);
      tip.hide();
    },
    onClick: (e) => {
      if (heatPtrType.current !== "touch") return;
      if (hoveredDay === day) {
        setHoveredDay(null);
        tip.hide();
      } else {
        setHoveredDay(day);
        setHoveredCell(null);
        tip.show(tipForDay(day), e);
      }
    },
    onFocus: (e) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHoveredDay(day);
      setHoveredCell(null);
      tip.show(tipForDay(day), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHoveredDay(null);
      tip.hide();
    },
  });

  const bindLegend = (idx: number): HeatmapHoverHandlers => ({
    onPointerEnter: (e) => {
      heatPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHoveredLegend(idx);
      tip.show(tipForLegend(idx), e);
    },
    onPointerMove: (e) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (heatPtrType.current === "touch") return;
      setHoveredLegend(null);
      tip.hide();
    },
    onClick: (e) => {
      if (heatPtrType.current !== "touch") return;
      if (hoveredLegend === idx) {
        setHoveredLegend(null);
        tip.hide();
      } else {
        setHoveredLegend(idx);
        tip.show(tipForLegend(idx), e);
      }
    },
    onFocus: (e) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHoveredLegend(idx);
      tip.show(tipForLegend(idx), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHoveredLegend(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Reporting heatmap"
        subtitle="By day & hour"
        className="lg:col-span-8"
        onExpand={hasData ? () => setOpen(true) : undefined}
      >
        {hasData ? (
          renderHeatmap(data, 14, false, false, {
            hoveredCell,
            hoveredDay,
            hoveredLegend,
            bindCell,
            bindDay,
            bindLegend,
          })
        ) : (
          <EmptyState message="No reports in range" />
        )}
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Reporting heatmap"
        subtitle="Day-of-week × hour-of-day intensity"
        chart={
          <div className="py-4">
            {renderHeatmap(data, 36, weekdayOnly, intense, {
              hoveredCell,
              hoveredDay,
              hoveredLegend,
              bindCell,
              bindDay,
              bindLegend,
            })}
          </div>
        }
        controls={
          <>
            <Toggle
              label="Weekdays only"
              value={weekdayOnly}
              onChange={setWeekdayOnly}
            />
            <Toggle
              label="High-contrast scale"
              value={intense}
              onChange={setIntense}
            />
          </>
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              When residents file. Commute spikes (7-9am, 4-7pm) and weekday
              density indicate driving-related reports; evening/weekend spikes
              correlate with pedestrian-discovered issues like graffiti or
              sidewalk damage. Use this to staff the dispatch desk accurately.
            </Prose>
            <StatGrid>
              <Stat
                label="Peak slot"
                value={`${DAY_LABELS[peak.day]} ${String(peak.hour).padStart(2, "0")}:00`}
                hint={`${peak.count} reports`}
              />
              <Stat label="Avg / hour" value={avgPerCell.toFixed(1)} />
              <Stat
                label="Total"
                value={totalReports.toLocaleString()}
                hint="Across all slots"
              />
              <Stat
                label="Coverage"
                value={`${Math.round((data.filter((c) => c.count > 0).length / Math.max(data.length, 1)) * 100)}%`}
                hint="Slots with activity"
              />
            </StatGrid>
          </div>
        }
      />
      <tip.Portal />
    </>
  );
}
export const PeakHoursHeatmap = memo(PeakHoursHeatmapInner);

/* ==================================================================
   7. Top neighborhoods
   ================================================================== */

interface TopNeighborhoodsProps {
  data: NeighborhoodVolume[];
}

type NeighborhoodSort = "total" | "open";

function renderNeighborhoods(
  data: NeighborhoodVolume[],
  sortBy: NeighborhoodSort,
  limit: number,
  opts?: {
    hovered?: string | null;
    bindHover?: (
      n: NeighborhoodVolume,
      rank: number,
    ) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  const sorted = [...data].sort((a, b) =>
    sortBy === "open" ? b.open - a.open : b.count - a.count,
  );
  const max = Math.max(
    ...sorted.map((d) => (sortBy === "open" ? d.open : d.count)),
    1,
  );
  const shown = sorted.slice(0, limit);
  const hovered = opts?.hovered ?? null;

  return (
    <ul className="space-y-2.5">
      {shown.map((n, i) => {
        const v = sortBy === "open" ? n.open : n.count;
        const pct = (v / max) * 100;
        const bind = opts?.bindHover?.(n, i + 1);
        const isActive = hovered === n.name;
        const isDim = hovered !== null && !isActive;
        return (
          <li
            key={n.name}
            tabIndex={bind ? 0 : -1}
            className={cn(
              "rounded-md px-1.5 py-1 -mx-1.5 transition-all duration-150 outline-none",
              bind &&
                "cursor-default focus-visible:ring-1 focus-visible:ring-hairline-strong",
              isActive && "bg-overlay",
              isDim && "opacity-45",
            )}
            {...(bind ?? {})}
          >
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span
                className={cn(
                  "inline-flex items-center gap-2 min-w-0 transition-colors",
                  isActive ? "text-foreground" : "text-subtle",
                )}
              >
                <span
                  className={cn(
                    "w-3 text-[11px] tabular-nums transition-colors",
                    isActive ? "text-subtle" : "text-faint",
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate">{n.name}</span>
              </span>
              <span className="tabular-nums text-faint flex-shrink-0">
                {n.count}
                <span className="text-faint mx-1">·</span>
                <span className="text-[var(--status-warning-fg)]">
                  {n.open} open
                </span>
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-overlay">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background:
                    sortBy === "open"
                      ? "var(--color-warning)"
                      : "var(--pastel-sky-strong)",
                  opacity: isActive
                    ? sortBy === "open"
                      ? 1
                      : 0.9
                    : isDim
                      ? sortBy === "open"
                        ? 0.45
                        : 0.3
                      : sortBy === "open"
                        ? 0.75
                        : 0.55,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TopNeighborhoodsInner({ data }: TopNeighborhoodsProps) {
  const [open, setOpen] = useState(false);
  const [sortBy, setSortBy] = useState<NeighborhoodSort>("total");
  const [hovered, setHovered] = useState<string | null>(null);
  const tip = useHoverTip();

  const hasData = data.length > 0;
  const total = data.reduce((s, d) => s + d.count, 0);
  const totalSafe = total || 1;
  const totalOpen = data.reduce((s, d) => s + d.open, 0);
  const top = [...data].sort((a, b) => b.count - a.count)[0];
  const mostStuck = [...data].sort((a, b) => b.open - a.open)[0];

  // median of open counts (city-wide)
  const medianOpen = useMemo(() => {
    if (data.length === 0) return 0;
    const sorted = [...data].map((d) => d.open).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }, [data]);

  const tipFor = (n: NeighborhoodVolume, rank: number) => {
    const share = (n.count / totalSafe) * 100;
    const closedCount = Math.max(n.count - n.open, 0);
    const pctClosed = n.count > 0 ? (closedCount / n.count) * 100 : 0;
    const aboveMedian = n.open > medianOpen;
    const accent =
      sortBy === "open" ? "var(--color-warning)" : "var(--pastel-sky-strong)";
    return {
      title: n.name,
      accent,
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Total reports" value={n.count.toLocaleString()} />
          <TipRow
            label="Open"
            value={n.open.toLocaleString()}
            accent="var(--color-warning)"
          />
          <TipRow label="% closed" value={`${pctClosed.toFixed(0)}%`} />
          <TipRow label="Share of city" value={`${share.toFixed(1)}%`} muted />
          <TipBar pct={share} color={accent} />
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>
            Rank #{rank} of {data.length}
          </span>
          {aboveMedian ? (
            <TipChip tone="warn">Above median backlog</TipChip>
          ) : (
            <TipChip tone="neutral">At/below median</TipChip>
          )}
        </div>
      ),
    };
  };

  const nbPtrType = useRef<string>("mouse");
  const bindNeighborhood = (n: NeighborhoodVolume, rank: number) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      nbPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHovered(n.name);
      tip.show(tipFor(n, rank), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (nbPtrType.current === "touch") return;
      setHovered(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (nbPtrType.current !== "touch") return;
      if (hovered === n.name) {
        setHovered(null);
        tip.hide();
      } else {
        setHovered(n.name);
        tip.show(tipFor(n, rank), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHovered(n.name);
      tip.show(tipFor(n, rank), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHovered(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Top neighborhoods"
        className="lg:col-span-4"
        onExpand={hasData ? () => setOpen(true) : undefined}
      >
        {hasData ? (
          renderNeighborhoods(data, "total", 6, {
            hovered,
            bindHover: bindNeighborhood,
          })
        ) : (
          <EmptyState message="No reports in range" />
        )}
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Reports by neighborhood"
        subtitle={`${data.length} tracked areas · ${total} reports`}
        chart={
          <div className="py-2 text-[14px]">
            {renderNeighborhoods(data, sortBy, data.length, {
              hovered,
              bindHover: bindNeighborhood,
            })}
          </div>
        }
        controls={
          <PillGroup
            label="Sort by"
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: "total", label: "Total" },
              { value: "open", label: "Open" },
            ]}
          />
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Geographic concentration of reports. Hotspots reveal underserved
              areas, infrastructure-age clusters, or recent storm/event damage.
              Compare &ldquo;total&rdquo; vs. &ldquo;open&rdquo; ranking to find
              places where backlog is disproportionately large.
            </Prose>
            <StatGrid>
              <Stat
                label="Top area"
                value={top?.name ?? "-"}
                hint={top ? `${top.count} reports` : ""}
              />
              <Stat
                label="Most stuck"
                value={mostStuck?.name ?? "-"}
                hint={mostStuck ? `${mostStuck.open} open` : ""}
              />
              <Stat label="Total open" value={totalOpen.toLocaleString()} />
              <Stat
                label="Avg / area"
                value={(total / Math.max(data.length, 1)).toFixed(1)}
              />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const TopNeighborhoods = memo(TopNeighborhoodsInner);

/* ==================================================================
   8. Category resolution vs target
   ================================================================== */

interface CategoryResolutionTableProps {
  data: CategoryResolution[];
}

type CategorySort = "avg" | "over" | "count";

function renderCategoryBars(
  data: CategoryResolution[],
  onlyOverSla: boolean,
  sortBy: CategorySort,
  opts?: {
    hovered?: string | null;
    bindHover?: (row: CategoryResolution) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  let rows = onlyOverSla
    ? data.filter((d) => d.avg_hours > d.target_hours)
    : [...data];
  rows = rows.sort((a, b) => {
    if (sortBy === "over") {
      return b.avg_hours / b.target_hours - a.avg_hours / a.target_hours;
    }
    if (sortBy === "count") return b.count - a.count;
    return b.avg_hours - a.avg_hours;
  });
  const max = Math.max(
    ...rows.flatMap((d) => [d.avg_hours, d.target_hours]),
    1,
  );
  const hovered = opts?.hovered ?? null;
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const avgPct = (row.avg_hours / max) * 100;
        const targetPct = (row.target_hours / max) * 100;
        const overSla = row.avg_hours > row.target_hours;
        const bind = opts?.bindHover?.(row);
        const isHovered = hovered === row.category;
        const isDim = hovered !== null && !isHovered;
        return (
          <li
            key={row.category}
            className={cn(
              "grid grid-cols-12 items-center gap-3 rounded-md px-1.5 py-1 -mx-1.5 cursor-default focus:outline-none focus-visible:bg-overlay",
              isHovered && "bg-overlay",
            )}
            style={{
              opacity: isDim ? 0.5 : 1,
              transition:
                "opacity 160ms ease-out, background-color 160ms ease-out",
            }}
            tabIndex={bind ? 0 : -1}
            aria-label={
              bind
                ? `${row.label}, avg ${formatHours(row.avg_hours)}, target ${formatHours(row.target_hours)}, ${row.count} reports`
                : undefined
            }
            {...(bind ?? {})}
          >
            <div className="col-span-3 flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "h-2 w-2 rounded-full flex-shrink-0 transition-transform",
                  isHovered && "scale-150",
                )}
                style={{ background: row.color }}
              />
              <span className="text-[13px] text-subtle truncate">
                {row.label}
              </span>
            </div>
            <div className="col-span-7 relative h-2.5">
              <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-overlay" />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${avgPct}%`,
                  background: overSla ? "var(--color-danger)" : row.color,
                  opacity: isHovered ? 1 : overSla ? 0.85 : 0.75,
                }}
              />
              <div
                className="absolute top-[-3px] bottom-[-3px] w-[2px] rounded-sm bg-foreground/70"
                style={{ left: `${targetPct}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="col-span-2 text-right text-[12px] tabular-nums">
              <span
                className={cn(
                  "font-medium",
                  overSla
                    ? "text-[var(--status-danger-fg)]"
                    : "text-foreground",
                )}
              >
                {formatHours(row.avg_hours)}
              </span>
              <span className="text-faint mx-1">·</span>
              <span className="text-faint">{row.count}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryResolutionTableInner({ data }: CategoryResolutionTableProps) {
  const [open, setOpen] = useState(false);
  const [onlyOverSla, setOnlyOverSla] = useState(false);
  const [sortBy, setSortBy] = useState<CategorySort>("avg");
  const [hovered, setHovered] = useState<string | null>(null);
  const tip = useHoverTip();

  const hasData = data.length > 0;
  const overSlaCount = data.filter((d) => d.avg_hours > d.target_hours).length;
  const worstOffender = [...data].sort(
    (a, b) => b.avg_hours / b.target_hours - a.avg_hours / a.target_hours,
  )[0];
  const total = data.reduce((s, d) => s + d.count, 0);
  const weightedAvg =
    data.reduce((s, d) => s + d.avg_hours * d.count, 0) / Math.max(total, 1);

  const rankedByVolume = useMemo(
    () => [...data].sort((a, b) => b.count - a.count),
    [data],
  );
  const rankedBySlaBreach = useMemo(
    () =>
      [...data].sort(
        (a, b) => b.avg_hours / b.target_hours - a.avg_hours / a.target_hours,
      ),
    [data],
  );
  const volumeRank = (cat: string) =>
    rankedByVolume.findIndex((r) => r.category === cat) + 1;
  const slaRank = (cat: string) =>
    rankedBySlaBreach.findIndex((r) => r.category === cat) + 1;

  const tipFor = (row: CategoryResolution) => {
    const ratio = row.avg_hours / row.target_hours;
    const variancePct = (ratio - 1) * 100;
    const overSla = row.avg_hours > row.target_hours;
    const wellUnder = variancePct < -20;
    const overBy = row.avg_hours - row.target_hours;
    const barPct = Math.min(100, ratio * 100);
    return {
      title: row.label,
      accent: row.color,
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow
            label="Avg resolution"
            value={formatHours(row.avg_hours)}
            accent={overSla ? "var(--color-danger)" : undefined}
          />
          <TipRow label="Target SLA" value={formatHours(row.target_hours)} />
          <TipRow
            label="Variance"
            value={`${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(0)}%`}
            accent={
              overSla
                ? "var(--color-danger)"
                : wellUnder
                  ? "var(--color-success)"
                  : undefined
            }
          />
          <TipBar
            pct={barPct}
            color={overSla ? "var(--color-danger)" : row.color}
          />
          <TipRow label="Volume" value={row.count.toLocaleString()} muted />
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between gap-2">
          <span className="text-faint">
            Vol #{volumeRank(row.category)} · SLA #{slaRank(row.category)} of{" "}
            {data.length}
          </span>
          {overSla ? (
            <TipChip tone="bad">
              Over SLA by {formatHours(Math.round(overBy))}
            </TipChip>
          ) : wellUnder ? (
            <TipChip tone="good">Well under SLA</TipChip>
          ) : (
            <TipChip tone="neutral">Within SLA</TipChip>
          )}
        </div>
      ),
    };
  };

  const rowPtrType = useRef<string>("mouse");
  const bindRow = (row: CategoryResolution) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      rowPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setHovered(row.category);
      tip.show(tipFor(row), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (rowPtrType.current === "touch") return;
      setHovered(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (rowPtrType.current !== "touch") return;
      if (hovered === row.category) {
        setHovered(null);
        tip.hide();
      } else {
        setHovered(row.category);
        tip.show(tipFor(row), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const target = e.currentTarget as Element;
      const r = target.getBoundingClientRect();
      setHovered(row.category);
      tip.show(tipFor(row), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setHovered(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Resolution time by category"
        subtitle="vs. target SLA"
        className="lg:col-span-12"
        onExpand={hasData ? () => setOpen(true) : undefined}
      >
        {hasData ? (
          renderCategoryBars(data, false, "avg", {
            hovered,
            bindHover: bindRow,
          })
        ) : (
          <EmptyState message="No reports in range" />
        )}
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Resolution time by category"
        subtitle={`${overSlaCount} of ${data.length} over SLA`}
        chart={
          <div className="py-2 text-[14px]">
            {renderCategoryBars(data, onlyOverSla, sortBy, {
              hovered,
              bindHover: bindRow,
            })}
          </div>
        }
        controls={
          <>
            <PillGroup
              label="Sort by"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "avg", label: "Avg time" },
                { value: "over", label: "% over SLA" },
                { value: "count", label: "Volume" },
              ]}
            />
            <Toggle
              label="Only over SLA"
              value={onlyOverSla}
              onChange={setOnlyOverSla}
            />
          </>
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Each bar shows mean resolution time per category; the vertical
              mark is the target SLA for that category. Red bars exceed the SLA.
              These categories are operationally underperforming and should
              drive crew-assignment changes or vendor reviews.
            </Prose>
            <StatGrid>
              <Stat
                label="Over SLA"
                value={`${overSlaCount}/${data.length}`}
                hint="Categories"
              />
              <Stat
                label="Worst offender"
                value={worstOffender?.label ?? "-"}
                hint={
                  worstOffender
                    ? `${((worstOffender.avg_hours / worstOffender.target_hours - 1) * 100).toFixed(0)}% over target`
                    : ""
                }
              />
              <Stat
                label="Weighted avg"
                value={formatHours(Math.round(weightedAvg))}
                hint="Volume-weighted MTTR"
              />
              <Stat label="Reports" value={total.toLocaleString()} />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const CategoryResolutionTable = memo(CategoryResolutionTableInner);

/* ==================================================================
   9. Reporter velocity
   ================================================================== */

interface ReporterVelocityCardProps {
  data: ReporterVelocity;
}

function renderSpark(
  spark: number[],
  w: number,
  h: number,
  idPrefix: string,
  opts?: {
    activeIdx?: number | null;
    bindHover?: (
      i: number,
      v: number,
    ) => {
      onPointerEnter: (e: React.PointerEvent) => void;
      onPointerMove: (e: React.PointerEvent) => void;
      onPointerLeave: () => void;
      onFocus: (e: React.FocusEvent) => void;
      onBlur: () => void;
    };
  },
) {
  const max = Math.max(...spark, 1);
  // Single-point or empty sparks would otherwise produce a degenerate path.
  const step = spark.length > 1 ? w / (spark.length - 1) : w;
  const coords = spark.map((v, i) => ({
    x: i * step,
    y: h - (v / max) * h,
    v,
  }));
  const points = coords
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `M 0 ${h} L ${points
    .split(" ")
    .map((p) => p.replace(",", " "))
    .join(" L ")} L ${w} ${h} Z`;

  const activeIdx = opts?.activeIdx ?? null;
  const interactive = !!opts?.bindHover;
  // Generous hit radius scaled to chart height. Covers gaps between points.
  const hitR = Math.max(8, Math.min(step * 0.6, h * 0.35));
  // Per-instance gradient id; the tile and expanded sparks mount together, so a
  // shared id would let the browser resolve url(#…) to the wrong gradient.
  const gVelocity = `g-velocity-${idPrefix}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Reporter activity sparkline, ${spark.length} days`}
    >
      <defs>
        <linearGradient id={gVelocity} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--pastel-peach)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--pastel-peach)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill={`url(#${gVelocity})`}
        style={{
          opacity: activeIdx !== null ? 0.55 : 1,
          transition: "opacity 160ms ease-out",
        }}
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--pastel-peach-strong)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          opacity: activeIdx !== null ? 0.55 : 1,
          transition: "opacity 160ms ease-out",
        }}
      />
      {interactive &&
        opts?.bindHover &&
        (() => {
          const bindHover = opts.bindHover;
          return coords.map((p, i) => {
            const isActive = activeIdx === i;
            const isDim = activeIdx !== null && !isActive;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: coords is a derived static sparkline point list (one per day) that never reorders or filters
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 3.5 : 2.25}
                  fill="var(--pastel-peach-strong)"
                  style={{
                    opacity: isDim ? 0.3 : isActive ? 1 : 0.85,
                    transition: "r 140ms ease-out, opacity 140ms ease-out",
                    pointerEvents: "none",
                  }}
                />
                {/* biome-ignore lint/a11y/useSemanticElements: role="button" on an SVG <circle> hit area is the standard accessible pattern; no native button element exists inside SVG */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hitR}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`Day ${i + 1}: ${p.v} reporters`}
                  style={{ cursor: "pointer", outline: "none" }}
                  {...bindHover(i, p.v)}
                />
              </g>
            );
          });
        })()}
    </svg>
  );
}

function ReporterVelocityCardInner({ data }: ReporterVelocityCardProps) {
  const [open, setOpen] = useState(false);
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const tip = useHoverTip();
  const sparkId = useId();

  const hasSpark = data.spark.length > 0;
  // Math.max/min spread on an empty array yields -Infinity / +Infinity.
  const peak = hasSpark ? Math.max(...data.spark) : 0;
  const trough = hasSpark ? Math.min(...data.spark) : 0;
  const recent = data.spark.slice(-3).reduce((s, v) => s + v, 0) / 3;
  const earlier = data.spark.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
  const momentumPct = earlier ? ((recent - earlier) / earlier) * 100 : 0;
  const sparkAvg =
    data.spark.reduce((s, v) => s + v, 0) / Math.max(data.spark.length, 1);

  const bigNumberTip = (): Parameters<typeof tip.show>[0] => ({
    title: "Reporter activity",
    accent: "var(--pastel-peach-strong)",
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Unique reporters"
          value={data.unique_reporters.toLocaleString()}
        />
        <TipRow
          label="Reports / reporter"
          value={data.reports_per_reporter.toFixed(2)}
        />
        <TipRow label="Recent avg (3d)" value={recent.toFixed(1)} muted />
        <TipRow label="Early avg (3d)" value={earlier.toFixed(1)} muted />
        <p className="text-[11px] text-faint leading-snug mt-1">
          Civic-engagement signal, breadth (unique reporters) vs depth (reports
          per reporter).
        </p>
      </div>
    ),
    footer: (
      <div className="flex items-center justify-between">
        <span>{data.spark.length}d window</span>
        <TipChip tone={momentumPct >= 0 ? "good" : "bad"}>
          {momentumPct >= 0 ? "+" : ""}
          {momentumPct.toFixed(0)}% momentum
        </TipChip>
      </div>
    ),
  });

  const bigNumPtrType = useRef<string>("mouse");
  // Tap-to-toggle state lives in a ref (like activeKey in useTouchTipBinder):
  // nothing in render reads it, so a useState would only force dead re-renders
  // and leave the onClick toggle reading a one-render-stale value.
  const bigNumTipOpen = useRef(false);
  const bindBigNumber = {
    onPointerEnter: (e: React.PointerEvent) => {
      bigNumPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      tip.show(bigNumberTip(), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (bigNumPtrType.current !== "touch") return;
      if (bigNumTipOpen.current) {
        bigNumTipOpen.current = false;
        tip.hide();
      } else {
        bigNumTipOpen.current = true;
        tip.show(bigNumberTip(), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as Element).getBoundingClientRect();
      tip.show(bigNumberTip(), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      bigNumTipOpen.current = false;
      tip.hide();
    },
  };

  const sparkTipFor = (
    i: number,
    v: number,
  ): Parameters<typeof tip.show>[0] => {
    const delta = v - sparkAvg;
    const deltaPct = sparkAvg ? (delta / sparkAvg) * 100 : 0;
    return {
      title: `Day ${i + 1}`,
      accent: "var(--pastel-peach-strong)",
      body: (
        <div className="flex flex-col gap-1.5">
          <TipRow label="Reporters" value={v.toLocaleString()} />
          <TipRow label="Window avg" value={sparkAvg.toFixed(1)} muted />
          <TipBar
            pct={(v / Math.max(peak, 1)) * 100}
            color="var(--pastel-peach-strong)"
          />
          <p className="text-[11px] text-faint leading-snug mt-1">
            {i === 0
              ? "First day in window."
              : i === data.spark.length - 1
                ? "Most recent day."
                : `Day ${i + 1} of ${data.spark.length} in window.`}
          </p>
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between">
          <span>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)} vs avg
          </span>
          <TipChip
            tone={
              v === peak
                ? "good"
                : v === trough
                  ? "bad"
                  : deltaPct >= 0
                    ? "neutral"
                    : "warn"
            }
          >
            {v === peak
              ? "Peak"
              : v === trough
                ? "Trough"
                : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}%`}
          </TipChip>
        </div>
      ),
    };
  };

  const sparkPtrType = useRef<string>("mouse");
  const bindSparkPoint = (i: number, v: number) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      sparkPtrType.current = e.pointerType;
      if (e.pointerType === "touch") return;
      setActivePoint(i);
      tip.show(sparkTipFor(i, v), e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      tip.move(e);
    },
    onPointerLeave: () => {
      if (sparkPtrType.current === "touch") return;
      setActivePoint(null);
      tip.hide();
    },
    onClick: (e: React.MouseEvent) => {
      if (sparkPtrType.current !== "touch") return;
      if (activePoint === i) {
        setActivePoint(null);
        tip.hide();
      } else {
        setActivePoint(i);
        tip.show(sparkTipFor(i, v), e);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as Element).getBoundingClientRect();
      setActivePoint(i);
      tip.show(sparkTipFor(i, v), {
        clientX: r.left + r.width / 2,
        clientY: r.top,
      });
    },
    onBlur: () => {
      setActivePoint(null);
      tip.hide();
    },
  });

  return (
    <>
      <Tile
        title="Reporter activity"
        className="lg:col-span-4"
        onExpand={hasSpark ? () => setOpen(true) : undefined}
      >
        <div className="flex items-end justify-between gap-4">
          {/* biome-ignore lint/a11y/useSemanticElements: role="group" is the correct intentional semantic for this big-number summary cluster; no native equivalent preserves the layout */}
          <div
            // biome-ignore lint/a11y/noNoninteractiveTabindex: intentional keyboard-a11y, focus reveals a hover tooltip via bindBigNumber
            tabIndex={0}
            role="group"
            aria-label={`Unique reporters: ${data.unique_reporters}`}
            className={cn(
              "rounded-md outline-none cursor-default px-1 -mx-1 py-0.5 -my-0.5",
              "transition-colors duration-200",
              "focus-visible:ring-2 focus-visible:ring-hairline-strong",
              "hover:bg-overlay",
            )}
            {...bindBigNumber}
          >
            <p className="text-[28px] font-semibold tracking-tight text-foreground leading-none tabular-nums">
              {data.unique_reporters}
            </p>
            <p className="text-[13px] text-subtle mt-2 inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
              unique · {data.reports_per_reporter.toFixed(2)}/reporter
            </p>
          </div>
          <div className="h-14 w-[140px]">
            {hasSpark ? (
              renderSpark(data.spark, 200, 56, `${sparkId}-tile`, {
                activeIdx: activePoint,
                bindHover: bindSparkPoint,
              })
            ) : (
              <div className="flex h-full items-center justify-end text-[11px] text-faint">
                no trend
              </div>
            )}
          </div>
        </div>
        <tip.Portal />
      </Tile>
      <ExpandModal
        open={open}
        onClose={() => setOpen(false)}
        title="Reporter activity"
        subtitle={`${data.unique_reporters} unique reporters · ${data.spark.length}d`}
        chart={
          <div className="flex flex-col gap-6 py-2">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-[44px] font-semibold tracking-tight text-foreground leading-none tabular-nums">
                  {data.unique_reporters}
                </p>
                <p className="text-[13px] text-subtle mt-2 inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                  unique reporters · {data.reports_per_reporter.toFixed(2)}{" "}
                  reports each
                </p>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1 text-[14px] tabular-nums",
                  momentumPct >= 0
                    ? "text-[var(--status-success-fg)]"
                    : "text-[var(--status-danger-fg)]",
                )}
              >
                {momentumPct >= 0 ? (
                  <TrendingUp className="h-4 w-4" strokeWidth={2} />
                ) : (
                  <TrendingDown className="h-4 w-4" strokeWidth={2} />
                )}
                {Math.abs(momentumPct).toFixed(0)}% recent vs. early
              </div>
            </div>
            <div className="h-[40vh] min-h-[280px] w-full">
              {renderSpark(data.spark, 400, 140, `${sparkId}-expanded`)}
            </div>
          </div>
        }
        info={
          <div className="flex flex-col gap-5">
            <Prose>
              Civic-engagement signal. Unique reporters indicates breadth of
              citizen participation; reports-per-reporter indicates depth (do
              residents file once and leave, or stay engaged?). A healthy system
              grows breadth over time.
            </Prose>
            <StatGrid>
              <Stat
                label="Unique reporters"
                value={data.unique_reporters.toString()}
              />
              <Stat
                label="Per reporter"
                value={data.reports_per_reporter.toFixed(2)}
                hint="Avg reports filed"
              />
              <Stat
                label="Peak day"
                value={peak.toString()}
                hint={`Trough ${trough}`}
              />
              <Stat
                label="Momentum"
                value={`${momentumPct >= 0 ? "+" : ""}${momentumPct.toFixed(0)}%`}
                hint="Recent vs. early"
              />
            </StatGrid>
          </div>
        }
      />
    </>
  );
}

export const ReporterVelocityCard = memo(ReporterVelocityCardInner);

/* ==================================================================
   Recurring hotspots (OUTFLANK #41, recurring-problem detection)
   ================================================================== */

interface RecurringHotspotsProps {
  data: RecurringHotspot[];
}

function RecurringHotspotsCardInner({ data }: RecurringHotspotsProps) {
  const top = data.slice(0, 6);
  const maxEpisodes = Math.max(1, ...top.map((h) => h.episodes));

  return (
    <Tile
      title="Recurring hotspots"
      subtitle={
        data.length
          ? `${data.length} repeat ${data.length === 1 ? "site" : "sites"}`
          : undefined
      }
      className="lg:col-span-4"
    >
      {top.length === 0 ? (
        <EmptyState message="No recurring problem sites yet" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {top.map((h) => (
            <li
              key={`${h.category}-${h.lng.toFixed(4)}-${h.lat.toFixed(4)}`}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ background: h.color }}
                    aria-hidden
                  />
                  <span className="truncate text-subtle">{h.label}</span>
                </span>
                <span className="tabular-nums text-faint flex-shrink-0">
                  {h.episodes}× weeks · {h.total} reports
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(h.episodes / maxEpisodes) * 100}%`,
                    background: h.color,
                    opacity: 0.8,
                  }}
                />
              </div>
              <span className="text-[11px] text-faint tabular-nums">
                {h.open_count} still open · {h.first_seen} → {h.last_seen}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

export const RecurringHotspotsCard = memo(RecurringHotspotsCardInner);

/* ==================================================================
   SLA risk (OUTFLANK #14, SLA breach alerts, staff)
   ================================================================== */

interface SlaRiskProps {
  data: SlaRisk;
}

function SlaRiskCardInner({ data }: SlaRiskProps) {
  const total = data.on_track + data.at_risk + data.breached;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const segments = [
    {
      key: "breached",
      label: "Breached",
      count: data.breached,
      color: "var(--color-danger)",
    },
    {
      key: "at_risk",
      label: "At risk",
      count: data.at_risk,
      color: "var(--color-warning)",
    },
    {
      key: "on_track",
      label: "On track",
      count: data.on_track,
      color: "var(--color-success)",
    },
  ];

  return (
    <Tile
      title="SLA risk"
      subtitle={total > 0 ? `${total} open` : undefined}
      className="lg:col-span-4"
    >
      {total === 0 ? (
        <EmptyState message="No open backlog to assess" />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Segmented bar: breached | at-risk | on-track */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-overlay">
            {segments.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.key}
                  style={{ width: `${pct(s.count)}%`, background: s.color }}
                  title={`${s.label}: ${s.count}`}
                />
              ) : null,
            )}
          </div>
          <ul className="grid grid-cols-3 gap-2 text-center">
            {segments.map((s) => (
              <li key={s.key} className="flex flex-col items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="text-[20px] font-semibold tabular-nums text-foreground">
                  {s.count}
                </span>
                <span className="text-[11px] text-faint">{s.label}</span>
              </li>
            ))}
          </ul>
          {data.breached > 0 && (
            <p className="text-[12px] text-[var(--color-danger)]">
              {data.breached} report{data.breached === 1 ? "" : "s"} past their
              SLA window, prioritize these.
            </p>
          )}
        </div>
      )}
    </Tile>
  );
}

export const SlaRiskCard = memo(SlaRiskCardInner);
