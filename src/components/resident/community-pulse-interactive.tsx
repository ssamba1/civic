"use client";

import {
  ArrowUpRight,
  ArrowRight,
  ArrowDownRight,
  Users,
  Clock,
  Zap,
  MapPin,
  Sparkles,
} from "lucide-react";

import { ReportsTrend } from "@/components/analytics/analytics-bento";
import { Tile, EmptyState } from "@/components/analytics/bento-primitives";
import { CATEGORY_META } from "@/lib/dashboard-data";
import type { CityMorale } from "@/lib/resident-data";

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
  down: { label: "Catching our breath", color: "#ff9f0a", Icon: ArrowDownRight },
};

// Severity ramp: cool for minor, hot for critical. Matches the app's tones.
const SEVERITY: Record<1 | 2 | 3 | 4 | 5, { label: string; color: string }> = {
  1: { label: "Minor", color: "#5ac8fa" },
  2: { label: "Low", color: "#30d158" },
  3: { label: "Moderate", color: "#ffd60a" },
  4: { label: "High", color: "#ff9f0a" },
  5: { label: "Critical", color: "#ff453a" },
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
      <Icon className="h-4 w-4 flex-shrink-0 text-zinc-500" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-none text-white tabular-nums">
          {value}
        </p>
        <p className="mt-1 text-[11px] leading-none text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

function ProgressRing({ pct, color = "#30d158" }: { pct: number; color?: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative h-[104px] w-[104px] flex-shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-semibold leading-none text-white tabular-nums">
          {pct}%
        </span>
        <span className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
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
}: {
  label: string;
  value: number;
  deltaPct: number;
  goodWhenUp?: boolean;
}) {
  const up = deltaPct > 0;
  const flat = deltaPct === 0;
  const positive = flat ? false : up === goodWhenUp;
  const color = flat ? "#86868b" : positive ? "#30d158" : "#ff9f0a";
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-zinc-400">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[17px] font-semibold tabular-nums text-white">
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
    </div>
  );
}

function BarRow({
  label,
  count,
  pct,
  color,
  sub,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  sub?: string;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span className="truncate text-[13px] text-zinc-200">{label}</span>
        </span>
        <span className="flex-shrink-0 text-[13px] font-medium tabular-nums text-zinc-400">
          {sub ?? count.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color,
            transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>
    </li>
  );
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

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      {/* ── Band 1: editorial hero + this-week panel ───────────────── */}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <Tile title="Fixed together" className="lg:col-span-7">
          <div className="flex h-full flex-col justify-between gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                Issues fixed in {cityName}
              </p>
              <p className="mt-2 text-[60px] font-semibold leading-none tracking-tight text-white tabular-nums">
                {morale.resolvedTotal.toLocaleString()}
              </p>
              <p
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium"
                style={{ color: m.color }}
              >
                <m.Icon className="h-4 w-4" strokeWidth={2.25} />
                {m.label}
              </p>
              <p className="mt-4 max-w-[46ch] text-[13px] leading-relaxed text-zinc-400">
                Every fix started with a neighbor speaking up. {cityName} keeps
                getting better because people take a minute to report what they
                see.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
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
              <ProgressRing pct={morale.pctResolved} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <DeltaRow
                label="New reports"
                value={morale.reportedThisWeek}
                deltaPct={morale.reportedDeltaPct}
              />
              <DeltaRow
                label="Resolved"
                value={morale.resolvedThisWeek}
                deltaPct={morale.resolvedDeltaPct}
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                <span className="text-[13px] text-zinc-400">Being worked on</span>
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
              {morale.severity.map(({ severity, count }) => (
                <BarRow
                  key={severity}
                  label={SEVERITY[severity].label}
                  count={count}
                  pct={Math.round((count / maxSev) * 100)}
                  color={SEVERITY[severity].color}
                />
              ))}
            </ul>
          </Tile>

          <Tile title="Turned around fastest">
            {fastest ? (
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${CATEGORY_META[fastest.category].color}1f` }}
                >
                  <Zap
                    className="h-5 w-5"
                    style={{ color: CATEGORY_META[fastest.category].color }}
                    strokeWidth={2}
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-white">
                    {CATEGORY_META[fastest.category].label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-400">
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
              {morale.topFixedCategories.map(({ category, count }) => (
                <BarRow
                  key={category}
                  label={CATEGORY_META[category].label}
                  count={count}
                  pct={Math.round((count / maxCat) * 100)}
                  color={CATEGORY_META[category].color}
                />
              ))}
            </ul>
          )}
        </Tile>

        <Tile title="Where it's getting done" className="lg:col-span-4">
          <ul className="flex flex-col gap-3.5">
            {morale.topNeighborhoods.map((n) => (
              <BarRow
                key={n.name}
                label={n.name}
                count={n.count}
                pct={Math.round((n.count / maxHood) * 100)}
                color="#0a84ff"
                sub={`${n.resolvedPct}% done`}
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
            <MapPin className="h-3.5 w-3.5" style={{ color: "#30d158" }} strokeWidth={2.25} />
          </span>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-zinc-400">
            A reported pothole becomes a smoother drive to school. A fixed
            streetlight becomes a safer walk home. Across {cityName},{" "}
            <span className="font-medium text-zinc-200">
              {morale.activeReporters.toLocaleString()}
            </span>{" "}
            neighbors have filed{" "}
            <span className="font-medium text-zinc-200">
              {morale.totalReports.toLocaleString()}
            </span>{" "}
            reports, and{" "}
            <span className="font-medium text-zinc-200">
              {morale.resolvedTotal.toLocaleString()}
            </span>{" "}
            are already resolved. Thanks for being part of it.
          </p>
        </div>
      </Tile>
    </div>
  );
}
