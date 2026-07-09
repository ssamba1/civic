# 0003 — Map marker clustering with supercluster

- Status: **Accepted** (2026-07-08)
- Scope: how the report map renders at scale.

## Context

The map renders every visible report as a deck.gl `IconLayer` marker. agents.md
flags the known pitfall: the layer degrades past ~5k markers (GPU atlas packing +
per-marker picking). The pilot corpus is small, but any real city or a
multi-city view blows past that.

## Decision

Cluster at the **data layer** with `supercluster` (agents.md's named remedy),
engaged only above a threshold:

- `src/lib/map/clustering.ts` — pure `buildClusterIndex` / `clustersForView` /
  `clusterExpansionZoom` wrapping supercluster; unit-tested, framework-free.
- `report-map.tsx` builds the index (memoized on the report set), queries it for
  the live viewport (tracked via `onMoveEnd`), and renders clusters as
  sqrt-scaled `ScatterplotLayer` bubbles + a `TextLayer` count. Clicking a
  bubble flies to its expansion zoom.
- Gated behind `CLUSTER_THRESHOLD = 500`: below it, every pin renders exactly as
  before (zero behavior change for the demo/pilot); above it, points aggregate.

## Alternatives considered

- **deck.gl-native aggregation** (Hexagon/Grid layers): loses per-report
  identity + click-through; wrong for an operational map.
- **No clustering, viewport culling only**: doesn't fix the >5k atlas cost.

## Consequences

- New dependency `supercluster@8` (+ types). Owner opt-in granted for the sweep.
- Cluster-bubble visual polish still wants a browser/Lighthouse pass.
- Threshold is a constant; if a pilot city exceeds ~500 open reports the
  clustered path activates automatically.
