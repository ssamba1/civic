"use client";

import { Camera, Maximize, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { RoutingFlowData } from "@/lib/routing/flow-data";
import { DEFAULT_WEIGHTS } from "@/lib/routing/org-units";
import { isValidTeamId, TEAMS } from "@/lib/teams";
import { cn } from "@/lib/utils/cn";

/* ==================================================================
   RoutingFlow — dependency-free flow-chart of the routing pipeline.

   Layered DAG, left → right:

     intake → AI classify → categories → divisions → crews   (legacy)
     intake → AI classify → categories → org-unit tree        (042)

   Layout is a pure function of the data (fixed node sizes, columns
   stacked and vertically centered), so nodes and SVG edges share one
   coordinate space with no DOM measuring. Hovering a node BFS-walks
   the edge adjacency both ways and dims everything off that path.
   ================================================================== */

type NodeKind =
  | "intake"
  | "ai"
  | "category"
  | "team"
  | "crew"
  | "unit"
  | "sink";

interface FlowNodeSpec {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  /** Accent (division color). */
  color?: string;
  /** Live badge value; undefined hides the badge entirely. */
  count?: number;
  chips?: string[];
  href?: string;
  /** Dashed treatment: hollow crew shells, contractors, the manual sink. */
  dashed?: boolean;
}

interface FlowEdgeSpec {
  from: string;
  to: string;
  color?: string;
}

const NODE_W: Record<NodeKind, number> = {
  intake: 200,
  ai: 200,
  category: 176,
  team: 208,
  crew: 220,
  unit: 220,
  sink: 220,
};
const NODE_H: Record<NodeKind, number> = {
  intake: 92,
  ai: 92,
  category: 44,
  team: 78,
  crew: 78,
  unit: 92,
  sink: 60,
};
const COL_GAP = 84;
const V_GAP = 10;
const PAD = 28;
const NEUTRAL_EDGE = "var(--color-foreground)";

/** Org-unit labels are often stored as slugs ("streets_roads") — humanize for
 *  display without touching labels a human already wrote. */
function humanize(label: string): string {
  if (!/^[a-z0-9_]+$/.test(label)) return label;
  return label
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build the node columns + edges for one city's routing snapshot. */
function buildGraph(
  data: RoutingFlowData,
  categoryCounts: Record<string, number> | undefined,
  crewLinkBase: string | undefined,
): { columns: FlowNodeSpec[][]; edges: FlowEdgeSpec[] } {
  const edges: FlowEdgeSpec[] = [];
  const teamIndex = new Map(data.teams.map((t, i) => [t.key, i]));
  const teamColor = new Map(data.teams.map((t) => [t.key, t.color]));

  const total = categoryCounts
    ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
    : undefined;

  const intake: FlowNodeSpec = {
    id: "intake",
    kind: "intake",
    label: "Resident report",
    sublabel: "Photo + location, blurred client-side",
    count: total,
  };
  const ai: FlowNodeSpec = {
    id: "ai",
    kind: "ai",
    label: "AI classify",
    sublabel: "Gemini vision — category, severity, crew hint",
  };
  edges.push({ from: "intake", to: "ai" });

  // Categories, grouped by owning division so edge crossings stay minimal.
  const categories = [...data.categories].sort(
    (a, b) =>
      (teamIndex.get(a.teamKey) ?? 99) - (teamIndex.get(b.teamKey) ?? 99),
  );
  const categoryNodes: FlowNodeSpec[] = categories.map((c) => {
    edges.push({
      from: "ai",
      to: `cat:${c.key}`,
      color: teamColor.get(c.teamKey),
    });
    return {
      id: `cat:${c.key}`,
      kind: "category",
      label: c.label,
      color: teamColor.get(c.teamKey),
      count: categoryCounts?.[c.key] ?? (categoryCounts ? 0 : undefined),
    };
  });

  if (data.hasOrgTree) {
    // ---- 042 org-unit tree: category → root unit, then parent → child. ----
    const byParent = new Map<string | null, typeof data.units>();
    for (const u of data.units) {
      const list = byParent.get(u.parentId) ?? [];
      list.push(u);
      byParent.set(u.parentId, list);
    }
    const byId = new Map(data.units.map((u) => [u.id, u]));

    // Effective categories of a unit's subtree (leaf inheritance, cf.
    // lib/routing/org-units.ts effectiveCategories).
    const subtreeCats = (unitId: string, inherited: string[]): Set<string> => {
      const u = byId.get(unitId);
      if (!u) return new Set();
      const own = u.categories ?? inherited;
      const kids = byParent.get(unitId) ?? [];
      if (kids.length === 0) return new Set(own);
      const out = new Set<string>();
      for (const k of kids) {
        for (const c of subtreeCats(k.id, own)) out.add(c);
      }
      return out;
    };

    const unitNode = (
      u: (typeof data.units)[number],
      color: string | undefined,
    ): FlowNodeSpec => {
      const chips: string[] = [];
      if (u.skills.length > 0)
        chips.push(u.skills.join(", ").replace(/_/g, " "));
      if (u.capacity !== null) chips.push(`cap ${u.capacity}`);
      if (u.costPerJob) chips.push(`$${u.costPerJob}/job`);
      if (u.slaHours !== null) chips.push(`${u.slaHours}h SLA`);
      return {
        id: `unit:${u.id}`,
        kind: "unit",
        label: humanize(u.label),
        sublabel: u.isContractor ? "contractor" : u.kind,
        color,
        chips,
        dashed: u.isContractor,
      };
    };

    // Column per depth level, children kept adjacent to their parent. Lane
    // color comes from the root (its key is usually a TeamId) and flows down.
    const levels: FlowNodeSpec[][] = [];
    const rootColor = new Map<string, string | undefined>();
    const walk = (
      parentId: string | null,
      depth: number,
      laneColor: string | undefined,
    ) => {
      const kids = byParent.get(parentId) ?? [];
      for (const u of kids) {
        const color =
          laneColor ??
          (isValidTeamId(u.key) ? TEAMS[u.key].color : undefined) ??
          teamColor.get(u.key);
        if (parentId === null) rootColor.set(u.id, color);
        if (!levels[depth]) levels[depth] = [];
        levels[depth].push(unitNode(u, color));
        if (parentId !== null)
          edges.push({ from: `unit:${parentId}`, to: `unit:${u.id}`, color });
        walk(u.id, depth + 1, color);
      }
    };
    walk(null, 0, undefined);

    const roots = byParent.get(null) ?? [];
    const rootsCats = roots.map((root) => subtreeCats(root.id, []));

    // Stack categories in root order so cat → root edges barely cross.
    const catRootIdx = new Map<string, number>();
    rootsCats.forEach((cats, i) => {
      for (const c of cats) {
        if (!catRootIdx.has(c)) catRootIdx.set(c, i);
      }
    });
    categoryNodes.sort(
      (a, b) =>
        (catRootIdx.get(a.id.slice(4)) ?? 99) -
        (catRootIdx.get(b.id.slice(4)) ?? 99),
    );

    roots.forEach((root, i) => {
      for (const c of categories) {
        if (rootsCats[i].has(c.key))
          edges.push({
            from: `cat:${c.key}`,
            to: `unit:${root.id}`,
            color: rootColor.get(root.id) ?? teamColor.get(c.teamKey),
          });
      }
    });

    return { columns: [[intake], [ai], categoryNodes, ...levels], edges };
  }

  // ---- Legacy: category → division → crew (autoAssignCrew). ----
  const teamNodes: FlowNodeSpec[] = data.teams.map((t) => {
    const crewCount = data.crews.filter((c) => c.teamKey === t.key).length;
    for (const c of t.categories) {
      edges.push({ from: `cat:${c}`, to: `team:${t.key}`, color: t.color });
    }
    const count = categoryCounts
      ? t.categories.reduce((n, c) => n + (categoryCounts[c] ?? 0), 0)
      : undefined;
    return {
      id: `team:${t.key}`,
      kind: "team",
      label: t.label,
      sublabel: `${t.categories.length} ${t.categories.length === 1 ? "category" : "categories"} · ${crewCount} ${crewCount === 1 ? "crew" : "crews"}`,
      color: t.color,
      count,
    };
  });

  const crewNodes: FlowNodeSpec[] = [];
  let needsSink = false;
  for (const t of data.teams) {
    const teamCrews = data.crews.filter((c) => c.teamKey === t.key);
    if (teamCrews.length === 0) {
      needsSink = true;
      edges.push({ from: `team:${t.key}`, to: "sink", color: t.color });
      continue;
    }
    for (const c of teamCrews) {
      edges.push({ from: `team:${t.key}`, to: `crew:${c.id}`, color: t.color });
      const chips: string[] = [];
      if (c.crewTypeLabel) chips.push(c.crewTypeLabel);
      chips.push(
        `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"}`,
      );
      crewNodes.push({
        id: `crew:${c.id}`,
        kind: "crew",
        label: c.name,
        color: t.color,
        count: c.openCount,
        chips,
        dashed: c.memberCount === 0,
        href:
          crewLinkBase && c.crewType
            ? `${crewLinkBase}/${c.crewType}`
            : undefined,
      });
    }
  }
  if (needsSink) {
    crewNodes.push({
      id: "sink",
      kind: "sink",
      label: "Manual dispatch",
      sublabel: "no matching crew — staff assign",
      dashed: true,
    });
  }

  return {
    columns: [[intake], [ai], categoryNodes, teamNodes, crewNodes],
    edges,
  };
}

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Stack each column, center it vertically, return per-node rects. */
function layoutColumns(columns: FlowNodeSpec[][]): {
  rects: Map<string, LayoutRect>;
  width: number;
  height: number;
} {
  const colHeights = columns.map((col) =>
    col.reduce((h, n) => h + NODE_H[n.kind] + V_GAP, -V_GAP),
  );
  const innerH = Math.max(...colHeights, 0);
  const rects = new Map<string, LayoutRect>();

  let x = PAD;
  for (const [i, col] of columns.entries()) {
    const colW = Math.max(...col.map((n) => NODE_W[n.kind]), 0);
    let y = PAD + (innerH - colHeights[i]) / 2;
    for (const n of col) {
      rects.set(n.id, { x, y, w: NODE_W[n.kind], h: NODE_H[n.kind] });
      y += NODE_H[n.kind] + V_GAP;
    }
    x += colW + COL_GAP;
  }
  return { rects, width: x - COL_GAP + PAD, height: innerH + PAD * 2 };
}

function edgePath(a: LayoutRect, b: LayoutRect): string {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const dx = Math.max(28, (x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const STAGE_LABELS: Record<NodeKind, string> = {
  intake: "Intake",
  ai: "Classification",
  category: "Category",
  team: "Division",
  crew: "Crew",
  unit: "Org unit",
  sink: "Crew",
};

export function RoutingFlow({
  data,
  categoryCounts,
  crewLinkBase,
}: {
  data: RoutingFlowData;
  /** Live per-category report counts; omit to hide all volume badges. */
  categoryCounts?: Record<string, number>;
  /** e.g. `/city/cumming/crew` — makes crew nodes link to their workspace. */
  crewLinkBase?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const { columns, edges } = useMemo(
    () => buildGraph(data, categoryCounts, crewLinkBase),
    [data, categoryCounts, crewLinkBase],
  );
  const { rects, width, height } = useMemo(
    () => layoutColumns(columns),
    [columns],
  );

  // Directed adjacency for the hover cone (upstream + downstream of a node).
  const activeSet = useMemo(() => {
    if (!hovered) return null;
    const fwd = new Map<string, string[]>();
    const rev = new Map<string, string[]>();
    for (const e of edges) {
      const f = fwd.get(e.from) ?? [];
      f.push(e.to);
      fwd.set(e.from, f);
      const r = rev.get(e.to) ?? [];
      r.push(e.from);
      rev.set(e.to, r);
    }
    const active = new Set<string>([hovered]);
    for (const adj of [fwd, rev]) {
      const queue = [hovered];
      while (queue.length > 0) {
        const cur = queue.pop();
        if (!cur) break;
        for (const next of adj.get(cur) ?? []) {
          if (!active.has(next)) {
            active.add(next);
            queue.push(next);
          }
        }
      }
    }
    return active;
  }, [hovered, edges]);

  const w = DEFAULT_WEIGHTS;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-hairline bg-surface shadow-[var(--shadow-card)]">
      {/* Edge-flow animation, disabled under reduced motion. */}
      <style>{`
        @keyframes routing-flow-dash { to { stroke-dashoffset: -24; } }
        .routing-edge-active { animation: routing-flow-dash 1.1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .routing-edge-active { animation: none; } }
      `}</style>

      {/* Toolbar: mode + scoring weights + zoom. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-overlay/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-subtle">
          <span className="rounded-full border border-hairline bg-surface px-2 py-0.5 font-medium uppercase tracking-[0.08em] text-faint">
            {data.hasOrgTree ? "Org-tree routing" : "Division routing"}
          </span>
          {data.hasOrgTree ? (
            <span className="tabular-nums">
              score = load {pct(w.load)} · cost {pct(w.cost)} · SLA {pct(w.sla)}{" "}
              · skill {pct(w.skill)}
            </span>
          ) : (
            <span>
              crew pick: AI hint → staffed → least load — hover any node to
              trace its paths
            </span>
          )}
          {data.orgTreeInert && (
            <span className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-faint">
              org tree configured but routes nothing — no unit declares
              categories
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-hairline text-subtle transition-colors hover:bg-overlay hover:text-foreground"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            onClick={() => setZoom(1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-hairline text-subtle transition-colors hover:bg-overlay hover:text-foreground"
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setZoom((z) => Math.min(1.4, +(z + 0.15).toFixed(2)))
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] border border-hairline text-subtle transition-colors hover:bg-overlay hover:text-foreground"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-auto">
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="relative"
            style={{
              width,
              height,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              backgroundImage:
                "radial-gradient(circle, color-mix(in oklab, var(--color-foreground) 7%, transparent) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {/* Stage captions above each column. */}
            {columns.map((col, i) => {
              const first = col[0];
              if (!first) return null;
              const r = rects.get(first.id);
              if (!r) return null;
              const label =
                data.hasOrgTree && i >= 3
                  ? i === 3
                    ? "Org tree"
                    : i === 4
                      ? "Units"
                      : ""
                  : STAGE_LABELS[first.kind];
              if (!label) return null;
              return (
                <span
                  key={`stage-${first.id}`}
                  className="absolute text-[10px] font-medium uppercase tracking-[0.12em] text-faint"
                  style={{ left: r.x, top: 8 }}
                >
                  {label}
                </span>
              );
            })}

            <svg
              width={width}
              height={height}
              className="absolute inset-0"
              aria-hidden="true"
            >
              {edges.map((e) => {
                const a = rects.get(e.from);
                const b = rects.get(e.to);
                if (!a || !b) return null;
                const active = activeSet
                  ? activeSet.has(e.from) && activeSet.has(e.to)
                  : false;
                const dimmed = activeSet !== null && !active;
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={edgePath(a, b)}
                    fill="none"
                    stroke={e.color ?? NEUTRAL_EDGE}
                    strokeWidth={active ? 2 : 1.25}
                    strokeOpacity={active ? 0.9 : dimmed ? 0.06 : 0.22}
                    strokeDasharray={active ? "5 5" : undefined}
                    strokeLinecap="round"
                    className={cn(
                      "transition-[stroke-opacity] duration-150",
                      active && "routing-edge-active",
                    )}
                  />
                );
              })}
            </svg>

            {columns.flat().map((n) => {
              const r = rects.get(n.id);
              if (!r) return null;
              const dimmed = activeSet !== null && !activeSet.has(n.id);
              return (
                <FlowNode
                  key={n.id}
                  node={n}
                  rect={r}
                  dimmed={dimmed}
                  onHover={setHovered}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  node,
  rect,
  dimmed,
  onHover,
}: {
  node: FlowNodeSpec;
  rect: LayoutRect;
  dimmed: boolean;
  onHover: (id: string | null) => void;
}) {
  const body = (
    <>
      {/* Division accent bar. */}
      {node.color && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-[inherit]"
          style={{ backgroundColor: node.color }}
        />
      )}
      <div className="flex min-w-0 items-center gap-2">
        {node.kind === "intake" && (
          <Camera className="h-4 w-4 shrink-0 text-subtle" strokeWidth={1.75} />
        )}
        {node.kind === "ai" && (
          <Sparkles
            className="h-4 w-4 shrink-0 text-subtle"
            strokeWidth={1.75}
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-foreground",
            node.kind === "category" ? "text-[12px]" : "text-[13px]",
          )}
        >
          {node.label}
        </span>
        {node.count !== undefined && (
          <span className="shrink-0 rounded-full border border-hairline bg-overlay px-1.5 py-px text-[10px] font-medium tabular-nums text-subtle">
            {node.count}
          </span>
        )}
      </div>
      {node.sublabel && (
        <p className="mt-1 truncate text-[11px] leading-tight text-faint">
          {node.sublabel}
        </p>
      )}
      {node.chips && node.chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 overflow-hidden">
          {node.chips.map((chip) => (
            <span
              key={chip}
              className="truncate rounded border border-hairline bg-overlay/60 px-1 py-px text-[10px] text-faint"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </>
  );

  const className = cn(
    "absolute flex flex-col rounded-[var(--radius-md)] border bg-surface px-2.5 shadow-[var(--shadow-card)] transition-opacity duration-150",
    node.kind === "category" ? "justify-center" : "justify-center py-2",
    node.dashed ? "border-dashed border-hairline" : "border-hairline",
    dimmed && "opacity-25",
    node.href && "cursor-pointer hover:bg-overlay/60",
  );
  const style: React.CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
  };
  const hoverProps = {
    onMouseEnter: () => onHover(node.id),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(node.id),
    onBlur: () => onHover(null),
  };

  if (node.href) {
    return (
      <Link
        href={node.href}
        className={className}
        style={style}
        {...hoverProps}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={className} style={style} {...hoverProps}>
      {body}
    </div>
  );
}
