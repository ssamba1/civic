"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  MapPin,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ReportsTrend } from "@/components/analytics/analytics-bento";
import { EmptyState, Tile } from "@/components/analytics/bento-primitives";

import {
  TipBar,
  TipChip,
  TipRow,
  useHoverTip,
} from "@/components/analytics/hover-tip";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { CityMorale } from "@/lib/resident-data";

// Handler bundle returned by tip.bindTarget — spread onto a hoverable row.
type TipBindings = ReturnType<ReturnType<typeof useHoverTip>["bindTarget"]>;

/* ==================================================================
   Community Pulse — resident-facing, morale-first read on the city.
   Reframes every number as a win (issues fixed, faster fixes, work in
   motion) and reuses the analytics bento vocabulary. Laid out in bands
   of mixed size so it reads editorial, not like an admin stat wall.
   ================================================================== */

const MOMENTUM_META: Record<
  CityMorale["momentum"],
  { label: string; color: string; Icon: typeof ArrowUpRight }
> = {
  up: { label: "Picking up speed", color: "#30d158", Icon: ArrowUpRight },
  flat: { label: "Holding steady", color: "#5ac8fa", Icon: ArrowRight },
  down: {
    label: "Catching our breath",
    color: "#ff9f0a",
    Icon: ArrowDownRight,
  },
};

// Severity ramp: cool for minor, hot for critical. Matches the app's tones.
const SEVERITY: Record<1 | 2 | 3 | 4 | 5, { label: string; color: string }> = {
  1: { label: "Minor", color: "#5ac8fa" },
  2: { label: "Low", color: "#30d158" },
  3: { label: "Moderate", color: "#ffd60a" },
  4: { label: "High", color: "#ff9f0a" },
  5: { label: "Critical", color: "#ff453a" },
};

// Plain-language read on each tier, resident-facing (no ops jargon).
const SEVERITY_DESC: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Cosmetic — faded paint, light graffiti. No safety risk.",
  2: "Small stuff — a single dark streetlight or a hairline crack.",
  3: "Worth attention — a sidewalk trip hazard or pooling drainage.",
  4: "Pressing — a big pothole on a busy road or a downed sign.",
  5: "Urgent — a blocked road or gushing main. Crews move on these first.",
};

function formatFixTime(hours: number): string {
  if (!hours || hours <= 0) return "—";
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  if (days <= 0) return `${rem}h`;
  if (rem <= 0) return `${days}d`;
  return `${days}d ${rem}h`;
}

/* ---- small bespoke pieces (reuse tokens, keep the bento honest) ---- */

function MicroStat({
  value,
  label,
  Icon,
}: {
  value: string;
  label: string;
  Icon: typeof Users;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 flex-shrink-0 text-faint" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-none text-foreground tabular-nums">
          {value}
        </p>
        <p className="mt-1 text-[11px] leading-none text-faint">{label}</p>
      </div>
    </div>
  );
}

function ProgressRing({
  pct,
  color = "#30d158",
}: {
  pct: number;
  color?: string;
}) {
  const r = 38;
  const c = 2 * Math.PI * r;
  // Arc fills from 0 on mount so the CSS stroke transition always plays —
  // SSR renders the full arc otherwise and the animation never fires. The
  // label keeps the real pct so the number never flashes 0.
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  const dash = (Math.min(100, Math.max(0, fill)) / 100) * c;
  return (
    <div className="relative h-[104px] w-[104px] flex-shrink-0">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{
            transition: "stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-semibold leading-none text-foreground tabular-nums">
          {pct}%
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-faint">
          resolved
        </span>
      </div>
    </div>
  );
}

function DeltaRow({
  label,
  value,
  deltaPct,
  goodWhenUp = true,
  tipBindings,
  hoverLabel,
}: {
  label: string;
  value: number;
  deltaPct: number;
  goodWhenUp?: boolean;
  tipBindings?: TipBindings;
  hoverLabel?: string;
}) {
  const up = deltaPct > 0;
  const flat = deltaPct === 0;
  const positive = flat ? false : up === goodWhenUp;
  const color = flat ? "#86868b" : positive ? "#30d158" : "#ff9f0a";
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  const inner = (
    <>
      <span className="text-[13px] text-subtle">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[17px] font-semibold tabular-nums text-foreground">
          {value.toLocaleString()}
        </span>
        <span
          className="inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums"
          style={{ color }}
        >
          <Icon className="h-3 w-3" strokeWidth={2.25} />
          {flat ? "0%" : `${Math.abs(deltaPct)}%`}
        </span>
      </span>
    </>
  );

  if (!tipBindings) {
    return (
      <div className="flex items-center justify-between gap-3">{inner}</div>
    );
  }

  return (
    <button
      type="button"
      aria-label={hoverLabel}
      className="-mx-1.5 flex w-full cursor-default items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-overlay focus-visible:bg-overlay"
      {...tipBindings}
    >
      {inner}
    </button>
  );
}

function BarRow({
  label,
  count,
  pct,
  color,
  sub,
  tipBindings,
  hoverLabel,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  sub?: string;
  tipBindings?: TipBindings;
  hoverLabel?: string;
}) {
  // Width grows from 0 on mount so the CSS width transition always plays —
  // SSR renders the final width otherwise and the bar never animates in.
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span className="truncate text-[13px] text-foreground">{label}</span>
        </span>
        <span className="flex-shrink-0 text-[13px] font-medium tabular-nums text-subtle">
          {sub ?? count.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay-strong">
        <div
          className="h-full rounded-full"
          style={{
            width: `${w}%`,
            background: color,
            transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>
    </>
  );

  if (!tipBindings) {
    return <li className="flex flex-col gap-1.5">{content}</li>;
  }

  // Whole row is one focusable target — hover, focus, or tap reveals the
  // deeper read. Mirrors the workload-bars button pattern.
  return (
    <li>
      <button
        type="button"
        aria-label={hoverLabel}
        className="-mx-1.5 flex w-full cursor-default flex-col gap-1.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-overlay focus-visible:bg-overlay"
        {...tipBindings}
      >
        {content}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------
   Hover-tip content builders. Each returns the deeper read shown on
   hover / focus / tap — true share-of-total (not the bar's share-of-max
   width), rank within its group, and one plain sentence of context.
   Module-level so the component body just wires data → bindTarget.
   ------------------------------------------------------------------ */

// Rank each item by count (1 = highest), aligned to the input order.
function ranksByCount<T extends { count: number }>(items: T[]): number[] {
  const rank = new Array<number>(items.length);
  items
    .map((it, i) => ({ i, c: it.count }))
    .sort((a, b) => b.c - a.c)
    .forEach((o, idx) => {
      rank[o.i] = idx + 1;
    });
  return rank;
}

function severityTip(
  s: CityMorale["severity"][number],
  total: number,
  rank: number,
  groupLen: number,
) {
  const share = total > 0 ? (s.count / total) * 100 : 0;
  const color = SEVERITY[s.severity].color;
  return {
    title: `${SEVERITY[s.severity].label} priority`,
    accent: color,
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Reports"
          value={s.count.toLocaleString()}
          accent={color}
        />
        <TipRow label="Share of flags" value={`${share.toFixed(1)}%`} muted />
        <TipBar pct={share} color={color} />
        <p className="mt-1 text-[11px] leading-snug text-faint">
          {SEVERITY_DESC[s.severity]}
        </p>
      </div>
    ),
    footer: (
      <div className="flex items-center justify-between">
        <span>
          #{rank} most flagged of {groupLen}
        </span>
        <TipChip
          tone={s.severity >= 4 ? "bad" : s.severity === 3 ? "warn" : "neutral"}
        >
          {s.severity >= 4
            ? "Front of the line"
            : s.severity === 3
              ? "Same-week"
              : "Batched"}
        </TipChip>
      </div>
    ),
  };
}

function categoryTip(
  c: CityMorale["topFixedCategories"][number],
  total: number,
  rank: number,
  groupLen: number,
) {
  const meta = CATEGORY_META[c.category];
  const share = total > 0 ? (c.count / total) * 100 : 0;
  return {
    title: meta.label,
    accent: meta.color,
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Fixed"
          value={c.count.toLocaleString()}
          accent={meta.color}
        />
        <TipRow label="Share of fixes" value={`${share.toFixed(1)}%`} muted />
        <TipBar pct={share} color={meta.color} />
        <p className="mt-1 text-[11px] leading-snug text-faint">
          {meta.label} issues neighbors flagged that the city has already
          closed.
        </p>
      </div>
    ),
    footer: (
      <div className="flex items-center justify-between">
        <span>
          #{rank} most fixed of {groupLen}
        </span>
        {rank === 1 && <TipChip tone="good">Top fix</TipChip>}
      </div>
    ),
  };
}

function neighborhoodTip(
  n: CityMorale["topNeighborhoods"][number],
  total: number,
  rank: number,
  groupLen: number,
) {
  const share = total > 0 ? (n.count / total) * 100 : 0;
  return {
    title: n.name,
    accent: "#0a84ff",
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Reports"
          value={n.count.toLocaleString()}
          accent="#0a84ff"
        />
        <TipRow label="Resolved" value={`${n.resolvedPct}%`} accent="#30d158" />
        <TipBar pct={n.resolvedPct} color="#30d158" />
        <TipRow
          label="Share of activity"
          value={`${share.toFixed(1)}%`}
          muted
        />
      </div>
    ),
    footer: (
      <div className="flex items-center justify-between">
        <span>
          #{rank} most active of {groupLen}
        </span>
        <TipChip
          tone={
            n.resolvedPct >= 60
              ? "good"
              : n.resolvedPct >= 30
                ? "warn"
                : "neutral"
          }
        >
          {n.resolvedPct}% done
        </TipChip>
      </div>
    ),
  };
}

function fixSpeedTip(b: CityMorale["fixSpeed"][number], total: number) {
  const share = total > 0 ? (b.count / total) * 100 : 0;
  return {
    title: `Fixed in ${b.label}`,
    accent: "#30d158",
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="Fixes"
          value={b.count.toLocaleString()}
          accent="#30d158"
        />
        <TipRow label="Share of fixes" value={`${share.toFixed(1)}%`} muted />
        <TipBar pct={share} color="#30d158" />
        <p className="mt-1 text-[11px] leading-snug text-faint">
          Issues the city closed within {b.label} of being reported.
        </p>
      </div>
    ),
  };
}

function deltaTip(
  label: string,
  value: number,
  deltaPct: number,
  goodWhenUp: boolean,
) {
  // Reconstruct prior week from the delta the card already shows.
  const prior =
    deltaPct !== 0 ? Math.round(value / (1 + deltaPct / 100)) : value;
  const change = value - prior;
  const flat = deltaPct === 0;
  const positive = flat ? false : deltaPct > 0 === goodWhenUp;
  const color = flat ? "#86868b" : positive ? "#30d158" : "#ff9f0a";
  return {
    title: label,
    accent: color,
    body: (
      <div className="flex flex-col gap-1.5">
        <TipRow
          label="This week"
          value={value.toLocaleString()}
          accent={color}
        />
        <TipRow label="Last week" value={prior.toLocaleString()} muted />
        <TipRow
          label="Change"
          value={`${change >= 0 ? "+" : ""}${change.toLocaleString()}`}
          muted
        />
      </div>
    ),
    footer: (
      <div className="flex items-center justify-between">
        <span>Week over week</span>
        <TipChip tone={flat ? "neutral" : positive ? "good" : "warn"}>
          {deltaPct > 0 ? "+" : ""}
          {deltaPct}%
        </TipChip>
      </div>
    ),
  };
}

export function CommunityPulseInteractive({
  morale,
  cityName,
}: {
  morale: CityMorale;
  cityName: string;
}) {
  const m = MOMENTUM_META[morale.momentum];
  const maxCat = Math.max(1, ...morale.topFixedCategories.map((c) => c.count));
  const maxSev = Math.max(1, ...morale.severity.map((s) => s.count));
  const maxHood = Math.max(1, ...morale.topNeighborhoods.map((n) => n.count));
  const maxSpeed = Math.max(1, ...morale.fixSpeed.map((b) => b.count));
  const fastest = morale.fastestCategory;

  const tip = useHoverTip();

  // True denominators for share-of-total in tooltips. The bars above scale to
  // share-of-max (for width), which would read wrong as a percentage.
  const sevTotal = morale.severity.reduce((s, x) => s + x.count, 0);
  const catTotal = morale.topFixedCategories.reduce((s, x) => s + x.count, 0);
  const hoodTotal = morale.topNeighborhoods.reduce((s, x) => s + x.count, 0);
  const speedTotal = morale.fixSpeed.reduce((s, x) => s + x.count, 0);

  const sevRank = ranksByCount(morale.severity);
  const catRank = ranksByCount(morale.topFixedCategories);
  const hoodRank = ranksByCount(morale.topNeighborhoods);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      {/* ── Band 1: editorial hero + this-week panel ───────────────── */}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <Tile title="Fixed together" className="lg:col-span-7">
          <div className="flex h-full flex-col justify-between gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-faint">
                Issues fixed in {cityName}
              </p>
              <p className="mt-2 text-[60px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
                {morale.resolvedTotal.toLocaleString()}
              </p>
              <p
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium"
                style={{ color: m.color }}
              >
                <m.Icon className="h-4 w-4" strokeWidth={2.25} />
                {m.label}
              </p>
              <p className="mt-4 max-w-[46ch] text-[13px] leading-relaxed text-subtle">
                Every fix started with a neighbor speaking up. {cityName} keeps
                getting better because people take a minute to report what they
                see.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-4 sm:grid-cols-3">
              <MicroStat
                value={morale.activeReporters.toLocaleString()}
                label="active neighbors"
                Icon={Users}
              />
              <MicroStat
                value={morale.resolvedThisWeek.toLocaleString()}
                label="fixed this week"
                Icon={Sparkles}
              />
              <MicroStat
                value={formatFixTime(morale.avgFixHours)}
                label="avg fix time"
                Icon={Clock}
              />
            </div>
          </div>
        </Tile>

        <Tile title="This week" className="lg:col-span-5">
          <div className="flex h-full flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex justify-center sm:justify-start">
              <button
                type="button"
                aria-label={`${morale.pctResolved}% of this week's reports resolved`}
                className="cursor-default rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-hairline-strong"
                {...tip.bindTarget(() => ({
                  title: "This week's progress",
                  accent: "#30d158",
                  body: (
                    <div className="flex flex-col gap-1.5">
                      <TipRow
                        label="Resolved"
                        value={morale.resolvedThisWeek.toLocaleString()}
                        accent="#30d158"
                      />
                      <TipRow
                        label="New reports"
                        value={morale.reportedThisWeek.toLocaleString()}
                        accent="#0a84ff"
                      />
                      <TipRow
                        label="Being worked on"
                        value={morale.inProgressCount.toLocaleString()}
                        accent="#5ac8fa"
                      />
                      <TipBar pct={morale.pctResolved} color="#30d158" />
                    </div>
                  ),
                  footer: (
                    <div className="flex items-center justify-between">
                      <span>Share of this week resolved</span>
                      <TipChip
                        tone={morale.pctResolved >= 50 ? "good" : "warn"}
                      >
                        {morale.pctResolved}%
                      </TipChip>
                    </div>
                  ),
                }))}
              >
                <ProgressRing pct={morale.pctResolved} />
              </button>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <DeltaRow
                label="New reports"
                value={morale.reportedThisWeek}
                deltaPct={morale.reportedDeltaPct}
                hoverLabel={`New reports this week: ${morale.reportedThisWeek}`}
                tipBindings={tip.bindTarget(() =>
                  deltaTip(
                    "New reports",
                    morale.reportedThisWeek,
                    morale.reportedDeltaPct,
                    true,
                  ),
                )}
              />
              <DeltaRow
                label="Resolved"
                value={morale.resolvedThisWeek}
                deltaPct={morale.resolvedDeltaPct}
                hoverLabel={`Resolved this week: ${morale.resolvedThisWeek}`}
                tipBindings={tip.bindTarget(() =>
                  deltaTip(
                    "Resolved",
                    morale.resolvedThisWeek,
                    morale.resolvedDeltaPct,
                    true,
                  ),
                )}
              />
              <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
                <span className="text-[13px] text-subtle">Being worked on</span>
                <span className="text-[17px] font-semibold tabular-nums text-[#5ac8fa]">
                  {morale.inProgressCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </Tile>
      </div>

      {/* ── Band 2: trend + severity + fastest ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        {/* ReportsTrend owns its own lg:col-span-8 lg:row-span-2 Tile. */}
        <ReportsTrend data={morale.trend} />

        <div className="flex flex-col gap-4 lg:col-span-4">
          <Tile title="What neighbors flag">
            <ul className="flex flex-col gap-2.5">
              {morale.severity.map((s, i) => (
                <BarRow
                  key={s.severity}
                  label={SEVERITY[s.severity].label}
                  count={s.count}
                  pct={Math.round((s.count / maxSev) * 100)}
                  color={SEVERITY[s.severity].color}
                  hoverLabel={`${SEVERITY[s.severity].label}: ${s.count} reports`}
                  tipBindings={tip.bindTarget(() =>
                    severityTip(
                      s,
                      sevTotal,
                      sevRank[i],
                      morale.severity.length,
                    ),
                  )}
                />
              ))}
            </ul>
          </Tile>

          <Tile title="Turned around fastest">
            {fastest ? (
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `${CATEGORY_META[fastest.category].color}1f`,
                  }}
                >
                  <Zap
                    className="h-5 w-5"
                    style={{ color: CATEGORY_META[fastest.category].color }}
                    strokeWidth={2}
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-foreground">
                    {CATEGORY_META[fastest.category].label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-subtle">
                    fixed in about {formatFixTime(fastest.hours)} on average
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState message="No fixes timed yet" />
            )}
          </Tile>
        </div>
      </div>

      {/* ── Band 3: categories + neighborhoods + fix speed ─────────── */}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <Tile title="Top issues your city fixed" className="lg:col-span-5">
          {morale.topFixedCategories.length === 0 ? (
            <EmptyState message="No fixes logged yet, check back soon" />
          ) : (
            <ul className="flex flex-col gap-3.5">
              {morale.topFixedCategories.map((c, i) => (
                <BarRow
                  key={c.category}
                  label={CATEGORY_META[c.category].label}
                  count={c.count}
                  pct={Math.round((c.count / maxCat) * 100)}
                  color={CATEGORY_META[c.category].color}
                  hoverLabel={`${CATEGORY_META[c.category].label}: ${c.count} fixed`}
                  tipBindings={tip.bindTarget(() =>
                    categoryTip(
                      c,
                      catTotal,
                      catRank[i],
                      morale.topFixedCategories.length,
                    ),
                  )}
                />
              ))}
            </ul>
          )}
        </Tile>

        <Tile title="Where it's getting done" className="lg:col-span-4">
          <ul className="flex flex-col gap-3.5">
            {morale.topNeighborhoods.map((n, i) => (
              <BarRow
                key={n.name}
                label={n.name}
                count={n.count}
                pct={Math.round((n.count / maxHood) * 100)}
                color="#0a84ff"
                sub={`${n.resolvedPct}% done`}
                hoverLabel={`${n.name}: ${n.count} reports, ${n.resolvedPct}% resolved`}
                tipBindings={tip.bindTarget(() =>
                  neighborhoodTip(
                    n,
                    hoodTotal,
                    hoodRank[i],
                    morale.topNeighborhoods.length,
                  ),
                )}
              />
            ))}
          </ul>
        </Tile>

        <Tile title="How fast we fix" className="lg:col-span-3">
          <ul className="flex flex-col gap-3.5">
            {morale.fixSpeed.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                count={b.count}
                pct={Math.round((b.count / maxSpeed) * 100)}
                color="#30d158"
                hoverLabel={`Fixed in ${b.label}: ${b.count}`}
                tipBindings={tip.bindTarget(() => fixSpeedTip(b, speedTotal))}
              />
            ))}
          </ul>
        </Tile>
      </div>

      {/* ── Band 4: civic-impact close ─────────────────────────────── */}
      <Tile>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(48,209,88,0.12)" }}
          >
            <MapPin
              className="h-3.5 w-3.5"
              style={{ color: "#30d158" }}
              strokeWidth={2.25}
            />
          </span>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-subtle">
            A reported pothole becomes a smoother drive to school. A fixed
            streetlight becomes a safer walk home. Across {cityName},{" "}
            <span className="font-medium text-foreground">
              {morale.activeReporters.toLocaleString()}
            </span>{" "}
            neighbors have filed{" "}
            <span className="font-medium text-foreground">
              {morale.totalReports.toLocaleString()}
            </span>{" "}
            reports, and{" "}
            <span className="font-medium text-foreground">
              {morale.resolvedTotal.toLocaleString()}
            </span>{" "}
            are already resolved. Thanks for being part of it.
          </p>
        </div>
      </Tile>

      <tip.Portal />
    </div>
  );
}
