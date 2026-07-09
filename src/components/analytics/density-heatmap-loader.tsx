"use client";

// Client-only loader for the deck.gl/MapLibre heatmap. `next/dynamic` with
// `ssr: false` is only permitted inside a Client Component (Next 16), so the
// server page imports THIS wrapper instead of dynamic-importing the map itself.
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { DensityHeatmap as DensityHeatmapType } from "./density-heatmap";

const DensityHeatmap = dynamic(
  () =>
    import("./density-heatmap").then((m) => ({ default: m.DensityHeatmap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  },
);

export function DensityHeatmapLoader(
  props: ComponentProps<typeof DensityHeatmapType>,
) {
  return <DensityHeatmap {...props} />;
}
